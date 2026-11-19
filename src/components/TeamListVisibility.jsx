import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox } from './ui'
import './TeamListVisibility.css'

export default function TeamListVisibility() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0), saving = useRef(false)
  const load = useCallback(async () => {
    if (!isAdmin) return
    const version = ++request.current
    try {
      const [games, settings] = await Promise.all([
        supabase.from('games').select('key,name,public_teams_visible').order('key'),
        supabase.from('tournament_settings').select('edition_id').eq('id', 1).single(),
      ])
      if (games.error) throw new Error(/public_teams_visible|does not exist|schema cache/i.test(games.error.message)
        ? 'Aplica la migración 036 para activar el control de publicación. La revisión de inscripciones sigue disponible.' : games.error.message)
      if (settings.error) throw new Error(settings.error.message)
      if (!settings.data.edition_id || !['mlbb', 'ff'].every((key) => games.data.some((g) => g.key === key && typeof g.public_teams_visible === 'boolean'))) throw new Error('No se pudo verificar la publicación de ambos juegos. Reintenta.')
      if (version === request.current) { setSnapshot({ games: games.data, editionId: settings.data.edition_id }); setError('') }
    } catch (problem) { if (version === request.current) { setSnapshot(null); setError(problem.message) } }
  }, [isAdmin])
  useEffect(() => {
    if (!isAdmin) return
    void load()
    const refresh = () => { if (!document.hidden && !saving.current) void load() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [isAdmin, load])
  const change = async (game) => {
    if (!snapshot || saving.current) return
    saving.current = true; request.current++; setBusy(true); setError('')
    try {
      const { data, error: problem } = await supabase.rpc('set_public_team_list_visibility', {
        p_edition_id: snapshot.editionId, p_game_key: game.key,
        p_visible: !game.public_teams_visible, p_expected_visible: game.public_teams_visible,
      })
      if (problem) throw new Error(problem.message)
      if (data?.game_key !== game.key || data.edition_id !== snapshot.editionId || data.public_teams_visible !== !game.public_teams_visible) throw new Error('No se pudo confirmar el cambio. Actualiza y revisa su estado.')
      toast.success(`${game.name}: publicación ${data.public_teams_visible ? 'activada' : 'desactivada'}.`)
      await load()
    } catch (problem) { await load(); setError(problem.message) }
    finally { saving.current = false; setBusy(false) }
  }
  if (!isAdmin) return null
  return <TeamListVisibilityControls snapshot={snapshot} error={error} busy={busy} onChange={change} onRetry={() => void load()} />
}

export function TeamListVisibilityControls({ snapshot, error, busy, onChange, onRetry }) {
  return <section className="team-list-visibility" aria-label="Visibilidad de equipos en la web">
    <strong>Visibilidad en la web</strong>
    <div className="team-list-visibility__games">{['mlbb', 'ff'].map((key) => {
      const game = snapshot?.games.find((g) => g.key === key)
      return <div className="team-list-visibility__game" key={key}><span>{key === 'mlbb' ? 'MLBB' : 'Free Fire'}</span>
        <button type="button" className={`btn btn--sm team-list-visibility__switch ${game?.public_teams_visible ? 'team-list-visibility__switch--on' : ''}`} role="switch" aria-label={`Publicar equipos confirmados de ${key === 'mlbb' ? 'MLBB' : 'Free Fire'}`} aria-checked={game?.public_teams_visible ?? false} disabled={busy || !game} onClick={() => onChange(game)}>{game ? game.public_teams_visible ? 'Publicado' : 'Oculto' : error ? 'No disponible' : 'Cargando…'}</button>
      </div>
    })}</div>
    <p className="hint team-list-visibility__help">Al ocultar, la web mostrará «La lista oficial de equipos se publicará próximamente». Las inscripciones y aprobaciones se conservan.</p>
    <ErrorBox error={error} />{error && <button type="button" className="btn btn--sm" disabled={busy} onClick={onRetry}>Reintentar</button>}
  </section>
}
