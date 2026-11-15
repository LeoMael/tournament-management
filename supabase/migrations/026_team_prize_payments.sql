-- Premios finales por puesto de FF y MLBB. No modifica resultados ni realiza transferencias.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='025') then raise exception 'Se requiere 025'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

create table public.team_prize_settlements (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.tournament_editions(id),
  game_key text not null references public.games(key) check(game_key in ('ff','mlbb')),
  stage_id uuid not null references public.stages(id),
  edition_name text not null,
  stage_name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(edition_id,game_key)
);
create table public.team_prize_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.team_prize_settlements(id),
  edition_id uuid not null references public.tournament_editions(id),
  registration_id uuid not null references public.registrations(id),
  place integer not null check(place between 1 and 3),
  team_name text not null,
  registered_name text not null,
  prize_yape_phone text not null check(prize_yape_phone ~ '^[0-9]{8,15}$'),
  amount numeric(12,2) not null check(amount between 0 and 9999999999.99),
  reward_text text not null default '',
  item_text text not null default '' check(char_length(item_text)<=240),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  reference text not null default '' check(char_length(reference)<=300),
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id),
  unique(settlement_id,place), unique(settlement_id,registration_id),
  check(paid_at is null or amount>0),
  check(delivered_at is null or item_text<>'')
);
do $$ declare t text; begin
  foreach t in array array['team_prize_settlements','team_prize_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy staff_read on public.%I for select to authenticated using(public.has_role(array[''admin'',''revisor_arbitro'']) and edition_id=public.current_edition_id())',t);
    execute format('create trigger audit_team_prizes after insert or update or delete on public.%I for each row execute function public.audit_trigger()',t);
  end loop;
end $$;

-- Contexto privado: FF usa su podio confirmado; MLBB toma la final y ofrece sus semifinalistas para 3.º.
create function public.team_prize_context(p_edition_id uuid,p_game_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s stages%rowtype; f matches%rowtype; podium jsonb:='[]'; candidates jsonb:='[]'; blocker text; final_round integer;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if p_game_key is null or p_game_key not in ('ff','mlbb') then raise exception 'Juego inválido'; end if;
  select * into s from stages where edition_id=p_edition_id and game_key=p_game_key order by position desc,created_at desc,id desc limit 1;
  if not found then blocker:='Primero crea y termina la fase final del torneo.';
  elsif not exists(select 1 from matches where stage_id=s.id) or exists(select 1 from matches where edition_id=p_edition_id and stage_id in(select id from stages where game_key=p_game_key) and status<>'completed') then
    blocker:='Termina todas las partidas del juego antes de confirmar premios.';
  elsif p_game_key='ff' then
    if s.type<>'battle_royale' or jsonb_typeof(s.config->'podium') is distinct from 'array' then
      blocker:='Confirma el podio oficial Top 3 de la fase final de Free Fire.';
    elsif jsonb_array_length(s.config->'podium')<>3 or s.config->>'champion' is distinct from s.config->'podium'->>0 then
      blocker:='Confirma un podio oficial con tres equipos y el campeón en primer lugar.';
    else podium:=s.config->'podium'; end if;
  elsif s.type<>'single_elim' then blocker:='MLBB necesita una fase final de eliminación directa terminada.';
  else
    select max(round) into final_round from matches where stage_id=s.id;
    if (select count(*) from matches where stage_id=s.id and round=final_round)<>1 then blocker:='No se pudo identificar una única final de MLBB.';
    else
      select * into f from matches where stage_id=s.id and round=final_round;
      if f.team_a is null or f.team_b is null or f.winner_id is null or f.winner_id not in (f.team_a,f.team_b) then blocker:='La final debe tener dos equipos y un ganador válido.';
      else
        podium:=jsonb_build_array(f.winner_id,case when f.winner_id=f.team_a then f.team_b else f.team_a end);
        select coalesce(jsonb_agg(distinct case when winner_id=team_a then team_b else team_a end),'[]') into candidates
          from matches where stage_id=s.id and round=final_round-1 and status='completed'
          and team_a is not null and team_b is not null and winner_id in(team_a,team_b);
        if jsonb_array_length(candidates)=0 then blocker:='No hay semifinalistas eliminados para asignar el tercer puesto.'; end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('edition_id',p_edition_id,'game_key',p_game_key,'stage_id',s.id,'stage_name',s.name,
    'blocker',blocker,'podium',podium,'third_candidates',candidates,
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'team_name',team_name,'captain_name',captain_name,'captain_whatsapp',captain_whatsapp,'prize_yape_phone',prize_yape_phone) order by team_name),'[]') from registrations where edition_id=p_edition_id and game_key=p_game_key and status='approved'),
    'prizes',(select coalesce(jsonb_agg(jsonb_build_object('place',place,'amount',amount,'reward_text',reward_text) order by place),'[]') from prizes where game_key=p_game_key and place between 1 and 3));
end $$;

create function public.confirm_team_prizes(p_edition_id uuid,p_game_key text,p_stage_id uuid,p_podium uuid[],p_items jsonb,p_expected_prizes jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare ctx jsonb; batch uuid; r registrations%rowtype; prize prizes%rowtype; i integer; item text;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  if p_game_key is null or p_game_key not in('ff','mlbb') then raise exception 'Juego inválido'; end if;
  -- Orden fijo de bloqueos: juego, fase, partidas, equipos y configuración de premios.
  perform 1 from games where key=p_game_key for update;
  if exists(select 1 from team_prize_settlements where edition_id=p_edition_id and game_key=p_game_key) then raise exception 'Los premios de este juego ya están confirmados. Actualiza la página.'; end if;
  perform 1 from stages where edition_id=p_edition_id and game_key=p_game_key order by id for update;
  perform 1 from matches where edition_id=p_edition_id and stage_id in(select id from stages where game_key=p_game_key) order by id for update;
  perform 1 from registrations where edition_id=p_edition_id and game_key=p_game_key order by id for update;
  perform 1 from prizes where game_key=p_game_key order by place for update;
  ctx:=team_prize_context(p_edition_id,p_game_key);
  if ctx->>'blocker' is not null then raise exception '%',ctx->>'blocker'; end if;
  if p_stage_id is distinct from (ctx->>'stage_id')::uuid then raise exception 'La fase final cambió. Actualiza la página.'; end if;
  if p_expected_prizes is distinct from ctx->'prizes' then raise exception 'Los premios configurados cambiaron. Actualiza y revisa los importes.'; end if;
  if coalesce(array_length(p_podium,1),0)<>3 or (select count(distinct x) from unnest(p_podium) x)<>3 then raise exception 'Selecciona tres equipos distintos'; end if;
  if p_game_key='ff' and to_jsonb(p_podium) is distinct from ctx->'podium' then raise exception 'El podio oficial cambió. Actualiza y revísalo.'; end if;
  if p_game_key='mlbb' and (p_podium[1]::text is distinct from ctx->'podium'->>0 or p_podium[2]::text is distinct from ctx->'podium'->>1 or not (ctx->'third_candidates' ? p_podium[3]::text)) then raise exception 'Verifica campeón, subcampeón y tercer puesto entre los semifinalistas eliminados'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<>3 then raise exception 'Revisa las entregas adicionales'; end if;
  if (select count(*) from prizes where game_key=p_game_key and place between 1 and 3)<>3 then raise exception 'Configura los tres premios del juego'; end if;
  insert into team_prize_settlements(edition_id,game_key,stage_id,edition_name,stage_name,created_by)
    values(p_edition_id,p_game_key,p_stage_id,(select name from tournament_editions where id=p_edition_id),ctx->>'stage_name',auth.uid()) returning id into batch;
  for i in 1..3 loop
    select * into r from registrations where id=p_podium[i] and edition_id=p_edition_id and game_key=p_game_key and status='approved';
    if not found then raise exception 'Un equipo del podio ya no está aprobado en este juego'; end if;
    if r.prize_yape_phone is null or r.prize_yape_phone !~ '^[0-9]{8,15}$' then raise exception 'Corrige el Yape para premios de %',r.team_name; end if;
    select * into prize from prizes where game_key=p_game_key and place=i;
    if jsonb_typeof(p_items->(i-1)) is distinct from 'string' then raise exception 'La entrega adicional debe ser texto'; end if;
    item:=btrim(p_items->>(i-1));
    if char_length(item)>240 then raise exception 'La entrega adicional admite hasta 240 caracteres'; end if;
    insert into team_prize_payments(settlement_id,edition_id,registration_id,place,team_name,registered_name,prize_yape_phone,amount,reward_text,item_text)
      values(batch,p_edition_id,r.id,i,r.team_name,r.captain_name,r.prize_yape_phone,prize.amount,coalesce(prize.reward_text,''),item);
  end loop;
  return batch;
end $$;

create function public.record_team_prize_payment(p_edition_id uuid,p_payment_id uuid,p_action text,p_reference text,p_expected_amount numeric,p_expected_yape text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p team_prize_payments%rowtype; corrected_yape text;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  -- Misma cabecera que la cancelación: impide borrar el lote mientras se registra un pago.
  perform 1 from team_prize_settlements where id=(select settlement_id from team_prize_payments where id=p_payment_id) for update;
  select * into p from team_prize_payments where id=p_payment_id and edition_id=p_edition_id for update;
  if not found then raise exception 'Premio no encontrado en esta edición'; end if;
  if p_expected_amount is distinct from p.amount or p_expected_yape is distinct from p.prize_yape_phone then raise exception 'El importe o destino cambió. Actualiza la página.'; end if;
  if char_length(coalesce(p_reference,''))>300 then raise exception 'Referencia demasiado larga'; end if;
  if p_action='refresh_yape' then
    if p.paid_at is not null then raise exception 'El destino de un pago registrado no se puede cambiar'; end if;
    select prize_yape_phone into corrected_yape from registrations where id=p.registration_id and edition_id=p_edition_id for share;
    if corrected_yape is null or corrected_yape !~ '^[0-9]{8,15}$' then raise exception 'Corrige primero el Yape en la inscripción del equipo'; end if;
    if corrected_yape is distinct from p_reference then raise exception 'El Yape corregido cambió. Actualiza y verifica el nuevo destino.'; end if;
    update team_prize_payments set prize_yape_phone=corrected_yape where id=p.id returning * into p;
  elsif p_action='pay' then
    if p.amount<=0 then raise exception 'Este puesto no tiene premio monetario'; end if;
    if p.paid_at is null then update team_prize_payments set paid_at=now(),paid_by=auth.uid(),reference=btrim(coalesce(p_reference,'')) where id=p.id returning * into p; end if;
  elsif p_action='deliver' then
    if p.item_text='' then raise exception 'Este puesto no tiene entrega adicional'; end if;
    if p.delivered_at is null then update team_prize_payments set delivered_at=now(),delivered_by=auth.uid() where id=p.id returning * into p; end if;
  else raise exception 'Acción inválida'; end if;
  return to_jsonb(p);
end $$;

-- Solo puede rehacerse un lote que todavía no registra pagos ni entregas.
create function public.cancel_team_prizes(p_edition_id uuid,p_settlement_id uuid,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
declare s team_prize_settlements%rowtype;
begin
  if not is_admin() then raise exception 'Acceso exclusivo para administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into s from team_prize_settlements where id=p_settlement_id and edition_id=p_edition_id for update;
  if not found then raise exception 'Liquidación no encontrada'; end if;
  if p_confirmation is distinct from 'REHACER PREMIOS' then raise exception 'Escribe REHACER PREMIOS'; end if;
  if exists(select 1 from team_prize_payments where settlement_id=s.id and (paid_at is not null or delivered_at is not null)) then raise exception 'No se puede rehacer una liquidación con pagos o entregas registrados'; end if;
  delete from team_prize_payments where settlement_id=s.id;
  delete from team_prize_settlements where id=s.id;
end $$;

revoke all on function public.team_prize_context(uuid,text),public.confirm_team_prizes(uuid,text,uuid,uuid[],jsonb,jsonb),public.record_team_prize_payment(uuid,uuid,text,text,numeric,text),public.cancel_team_prizes(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.team_prize_context(uuid,text),public.confirm_team_prizes(uuid,text,uuid,uuid[],jsonb,jsonb),public.record_team_prize_payment(uuid,uuid,text,text,numeric,text),public.cancel_team_prizes(uuid,uuid,text) to authenticated;

-- Integra el nuevo historial privado en el cierre existente sin cambiar su proyección pública.
do $$ declare definition text; patched text; begin
  definition:=pg_get_functiondef('public.edition_close_preview()'::regprocedure);
  patched:=replace(definition,'''Liquidaciones Solo pendientes'',',
    '''Premios de equipos pendientes'',(select count(*) from team_prize_payments where amount>0 and paid_at is null),''Entregas de equipos pendientes'',(select count(*) from team_prize_payments where item_text<>'''' and delivered_at is null),''Liquidaciones Solo pendientes'',');
  if patched=definition then raise exception 'No se pudo integrar el diagnóstico de cierre'; end if;
  execute patched;
  definition:=pg_get_functiondef('public.close_tournament_edition(uuid,text,text,timestamptz)'::regprocedure);
  patched:=replace(definition,'''solo_payments''] loop','''solo_payments'',''team_prize_settlements'',''team_prize_payments''] loop');
  if patched=definition then raise exception 'No se pudo integrar el historial privado'; end if;
  definition:=patched;
  patched:=replace(definition,'delete from solo_payments;','delete from team_prize_payments; delete from team_prize_settlements; delete from solo_payments;');
  if patched=definition then raise exception 'No se pudo integrar la limpieza de edición'; end if;
  execute patched;
end $$;
insert into public.schema_migrations(version,description) values('026','Premios finales y pagos por puesto para equipos FF y MLBB');
notify pgrst,'reload schema';
commit;
