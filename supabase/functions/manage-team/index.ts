// Edge Function: gestión del equipo del panel (crear usuarios, cambiar rol, clave, quitar acceso).
// Corre en el servidor con la service_role que Supabase inyecta; esa clave NUNCA llega al navegador.
// Solo acepta llamadas de un usuario con rol 'admin'.
//
// Despliegue (Dashboard): Edge Functions -> Deploy a new function -> Via Editor -> nombre "manage-team",
// pega este archivo. En Settings de la función, desactiva "Verify JWT" (la verificación se hace aquí abajo).
import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['admin', 'editor', 'revisor_arbitro'] as const
type Role = (typeof ROLES)[number]

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido.')

    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1) ¿Quién llama? Se valida el token de sesión contra Auth.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: caller, error: callerErr } = await db.auth.getUser(token)
    if (callerErr || !caller.user) throw new HttpError(401, 'Sesión inválida. Vuelve a iniciar sesión.')

    // 2) ¿Es admin? (el rol sale de la tabla, nunca del cliente)
    const { data: me } = await db.from('admins').select('role, email').eq('user_id', caller.user.id).maybeSingle()
    if (me?.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede gestionar el equipo.')

    const input = await req.json().catch(() => ({}))
    const action = String(input.action ?? '')
    const audit = (op: string, row_key: string, old_data: unknown, new_data: unknown) =>
      db.from('audit_log').insert({
        actor: caller.user.id, actor_email: me.email, table_name: 'admins', op, row_key, old_data, new_data,
      })

    const requireRole = (value: unknown): Role => {
      if (!ROLES.includes(value as Role)) throw new HttpError(400, 'Rol inválido.')
      return value as Role
    }
    const requirePassword = (value: unknown): string => {
      const pass = String(value ?? '')
      if (pass.length < 10 || pass.length > 72) throw new HttpError(400, 'La contraseña debe tener entre 10 y 72 caracteres.')
      return pass
    }
    const requireMember = async (userId: unknown) => {
      const id = String(userId ?? '')
      const { data } = await db.from('admins').select('user_id, email, role').eq('user_id', id).maybeSingle()
      if (!data) throw new HttpError(404, 'Ese usuario no pertenece al equipo.')
      return data
    }
    // Nunca se puede dejar el sistema sin administradores.
    const assertNotLastAdmin = async (member: { user_id: string; role: string }) => {
      if (member.role !== 'admin') return
      const { count } = await db.from('admins').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) throw new HttpError(400, 'Debe quedar al menos un administrador.')
    }

    if (action === 'create') {
      const email = String(input.email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new HttpError(400, 'Correo inválido.')
      const role = requireRole(input.role)
      const password = requirePassword(input.password)
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) {
        throw new HttpError(400, /already|registered|exists/i.test(error?.message ?? '') ? 'Ese correo ya tiene una cuenta.' : 'No se pudo crear el usuario.')
      }
      const { error: insErr } = await db.from('admins').insert({ user_id: data.user.id, email, role })
      if (insErr) {
        await db.auth.admin.deleteUser(data.user.id) // no dejar cuentas huérfanas
        throw new HttpError(500, 'No se pudo registrar al usuario en el equipo.')
      }
      await audit('INSERT', data.user.id, null, { email, role })
      return reply(200, { ok: true })
    }

    if (action === 'set_role') {
      const member = await requireMember(input.user_id)
      const role = requireRole(input.role)
      if (role !== 'admin') await assertNotLastAdmin(member)
      const { error } = await db.from('admins').update({ role }).eq('user_id', member.user_id)
      if (error) throw new HttpError(500, 'No se pudo cambiar el rol.')
      await audit('UPDATE', member.user_id, { email: member.email, role: member.role }, { email: member.email, role })
      return reply(200, { ok: true })
    }

    if (action === 'set_password') {
      const member = await requireMember(input.user_id)
      const { error } = await db.auth.admin.updateUserById(member.user_id, { password: requirePassword(input.password) })
      if (error) throw new HttpError(500, 'No se pudo cambiar la contraseña.')
      await audit('UPDATE', member.user_id, null, { email: member.email, password: 'restablecida' })
      return reply(200, { ok: true })
    }

    if (action === 'remove') {
      const member = await requireMember(input.user_id)
      if (member.user_id === caller.user.id) throw new HttpError(400, 'No puedes quitarte el acceso a ti mismo.')
      await assertNotLastAdmin(member)
      const { error } = await db.from('admins').delete().eq('user_id', member.user_id)
      if (error) throw new HttpError(500, 'No se pudo quitar el acceso.')
      // Se borra la cuenta; si tiene historial (inscripciones revisadas), se bloquea en su lugar.
      const { error: delErr } = await db.auth.admin.deleteUser(member.user_id)
      if (delErr) await db.auth.admin.updateUserById(member.user_id, { ban_duration: '876000h' })
      await audit('DELETE', member.user_id, { email: member.email, role: member.role }, null)
      return reply(200, { ok: true })
    }

    throw new HttpError(400, 'Acción desconocida.')
  } catch (err) {
    if (err instanceof HttpError) return reply(err.status, { error: err.message })
    console.error(err)
    return reply(500, { error: 'Error interno.' })
  }
})
