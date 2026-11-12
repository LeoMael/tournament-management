// Base aislada en memoria: no usa .env ni conecta con Supabase.
// PGLITE_MODULE puede apuntar al módulo instalado fuera del repositorio.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const root = fileURLToPath(new URL('../', import.meta.url))
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
  `)
  const files = ['01_schema.sql', '02_seed.sql', ...fs.readdirSync(root + 'migrations').filter((x) => x.endsWith('.sql')).sort().map((x) => 'migrations/' + x)]
  for (const file of files) {
    if (file === 'migrations/013_solo_registration_slots.sql') {
      await db.exec(fs.readFileSync(root + 'tests/solo_slots_before_migration.sql', 'utf8'))
    }
    if (file === 'migrations/017_solo_room_announcements.sql') {
      await db.exec(`insert into solo_rooms(id,name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward)
        values('00000000-0000-0000-0000-000000001700','Borrador previo',now()+interval '2 days',now()+interval '1 day',2,2,1,10)`)
    }
    // gen_random_uuid es nativo; estos escenarios no utilizan las otras funciones de pgcrypto.
    await db.exec(fs.readFileSync(root + file, 'utf8').replace('create extension if not exists pgcrypto;', ''))
    if (file === 'migrations/013_solo_registration_slots.sql') {
      await db.exec(fs.readFileSync(root + 'tests/solo_slots_after_migration.sql', 'utf8'))
      console.log('PASS solo_slots_backfill')
    }
    if (file === 'migrations/017_solo_room_announcements.sql') {
      await db.exec(`do $$ begin
        if (select is_announced from solo_rooms where id='00000000-0000-0000-0000-000000001700') is distinct from false
          or exists(select 1 from public_solo_rooms where id='00000000-0000-0000-0000-000000001700') then
          raise exception 'TEST: migración publicó borrador existente';
        end if;
      end $$;
      delete from solo_rooms where id='00000000-0000-0000-0000-000000001700'`)
      console.log('PASS existing_solo_drafts_hidden')
    }
    console.log('OK', file)
  }
  await db.exec(`
    insert into auth.users values ('00000000-0000-0000-0000-000000000001','admin@test.local'),('00000000-0000-0000-0000-000000000002','reviewer@test.local'),('00000000-0000-0000-0000-000000000003','editor@test.local');
    insert into admins(user_id,email,role) select id,email,case when email like 'reviewer%' then 'revisor_arbitro' when email like 'editor%' then 'editor' else 'admin' end from auth.users;
    set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
  `)
  for (const file of ['tournament_modules.sql', 'tournament_permissions.sql', 'tournament_archive_roster.sql', 'solo_cancellations.sql', 'solo_room_deletion.sql', 'solo_bulk_results.sql', 'solo_slots.sql', 'public_solo_slots.sql', 'completed_solo_room_deletion.sql', 'solo_room_announcements.sql', 'solo_registration_deletion.sql']) {
    await db.exec(fs.readFileSync(root + 'tests/' + file, 'utf8'))
    console.log('PASS', file)
  }
} finally {
  await db.close()
}
