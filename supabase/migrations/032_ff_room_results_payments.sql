-- Paso 3: resultados y liquidaciones de Solo Top y Dúo. No modifica Solo por kills.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='031') then raise exception 'Se requiere 031'; end if;
  perform pg_advisory_xact_lock(724091);
end $$;

alter table public.ff_room_registrations add constraint ff_registration_scope unique(id,edition_id,room_kind,room_id);
create table public.ff_room_results (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique,
  edition_id uuid not null,
  room_kind text not null,
  room_id uuid not null,
  placement smallint check(placement between 1 and 100),
  kills_1 smallint not null check(kills_1 between 0 and 1000),
  kills_2 smallint not null default 0 check(kills_2 between 0 and 1000),
  booyah boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key(registration_id,edition_id,room_kind,room_id) references public.ff_room_registrations(id,edition_id,room_kind,room_id),
  unique(room_kind,room_id,placement),
  check(room_kind<>'solo_top' or kills_2=0),
  check(room_kind='duo_kills' or placement is not null),
  check(placement is null or booyah=(placement=1))
);
create unique index ff_room_one_booyah on public.ff_room_results(room_kind,room_id) where booyah;
create table public.ff_room_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  edition_id uuid not null,
  room_kind text not null,
  room_id uuid not null,
  concept text not null check(concept in('reward','refund')),
  amount numeric(14,2) not null check(amount between 0 and 21000000),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  paid_phone text check(paid_phone ~ '^[0-9]{8,15}$'),
  reference text not null default '' check(char_length(reference)<=200),
  created_at timestamptz not null default now(),
  foreign key(registration_id,edition_id,room_kind,room_id) references public.ff_room_registrations(id,edition_id,room_kind,room_id),
  unique(registration_id,concept),
  check((paid_at is null and paid_by is null and paid_phone is null) or (paid_at is not null and paid_phone is not null))
);
do $$ declare t text; begin
  foreach t in array array['ff_room_results','ff_room_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy staff_read on public.%I for select to authenticated using(public.is_admin() or (public.has_role(array[''revisor_arbitro'']) and edition_id=public.current_edition_id()))',t);
    execute format('create trigger edition_barrier before insert or update or delete on public.%I for each statement execute function public.edition_write_guard()',t);
    execute format('create trigger edition_row before insert or update on public.%I for each row execute function public.edition_write_guard()',t);
    execute format('create trigger audit_ff_money after insert or update or delete on public.%I for each row execute function public.audit_trigger()',t);
  end loop;
end $$;

create function public.save_ff_room_results(p_edition_id uuid,p_kind text,p_room_id uuid,p_results jsonb,p_expected_updated_at timestamptz default null,p_expect_empty boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; item jsonb; ids uuid[]:='{}'; rid uuid; pos integer; k1 integer; k2 integer; win boolean; positions integer[]:='{}'; wins integer:=0;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió'; end if;
  r:=ff_room_data(p_kind,p_room_id);
  if (r->>'edition_id')::uuid is distinct from p_edition_id or r->>'status'<>'playing' then raise exception 'Solo puedes guardar durante la partida'; end if;
  if (p_expect_empty and exists(select 1 from ff_room_results where room_id=p_room_id and room_kind=p_kind))
    or (p_expected_updated_at is not null and p_expected_updated_at is distinct from (select max(updated_at) from ff_room_results where room_id=p_room_id and room_kind=p_kind)) then
    raise exception 'Otro organizador guardó resultados. Descarta el borrador y revisa la versión actual';
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Envía todos los resultados'; end if;
  if jsonb_array_length(p_results) not between 1 and 100 then raise exception 'Cantidad inválida'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'kills_1') is distinct from 'number' or coalesce(item->>'kills_1','') !~ '^[0-9]{1,4}$'
      or jsonb_typeof(item->'kills_2') is distinct from 'number' or coalesce(item->>'kills_2','') !~ '^[0-9]{1,4}$'
      or jsonb_typeof(item->'booyah') is distinct from 'boolean' then raise exception 'Revisa kills enteras y Booyah'; end if;
    k1:=(item->>'kills_1')::integer; k2:=(item->>'kills_2')::integer; win:=(item->>'booyah')::boolean;
    if k1>1000 or k2>1000 or (p_kind='solo_top' and k2<>0) then raise exception 'Kills inválidas'; end if;
    pos:=null;
    if item->>'placement' is not null then
      if jsonb_typeof(item->'placement') is distinct from 'number' or item->>'placement' !~ '^[0-9]{1,3}$' then raise exception 'Posición inválida'; end if;
      pos:=(item->>'placement')::integer;
      if pos<1 or pos>(r->>'capacity')::integer or pos=any(positions) or win is distinct from (pos=1) then raise exception 'Revisa posiciones duplicadas y ganador'; end if;
      positions:=array_append(positions,pos);
    elsif p_kind<>'duo_kills' then raise exception 'Top requiere la posición de cada participante'; end if;
    rid:=(item->>'registration_id')::uuid;
    if rid is null or rid=any(ids) or not exists(select 1 from ff_room_registrations where id=rid and room_id=p_room_id and room_kind=p_kind and status='approved') then raise exception 'Jugador duplicado o no aprobado'; end if;
    ids:=array_append(ids,rid);
    if win then wins:=wins+1; end if;
  end loop;
  if wins>1 then raise exception 'Solo puede haber un Booyah'; end if;
  if cardinality(ids)<>(select count(*) from ff_room_registrations where room_id=p_room_id and room_kind=p_kind and status='approved') then raise exception 'Incluye todos los aprobados, también los ocultos por el buscador'; end if;
  -- Reemplazo atómico: permite intercambiar puestos y ganador sin conflictos intermedios.
  delete from ff_room_results where room_id=p_room_id and room_kind=p_kind;
  insert into ff_room_results(registration_id,edition_id,room_kind,room_id,placement,kills_1,kills_2,booyah)
    select (v->>'registration_id')::uuid,p_edition_id,p_kind,p_room_id,(v->>'placement')::smallint,(v->>'kills_1')::smallint,(v->>'kills_2')::smallint,(v->>'booyah')::boolean
    from jsonb_array_elements(p_results) v;
  update ff_room_results set updated_at=clock_timestamp() where room_id=p_room_id and room_kind=p_kind;
  return jsonb_build_object('saved',cardinality(ids));
end $$;
revoke all on function public.save_ff_room_results(uuid,text,uuid,jsonb,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.save_ff_room_results(uuid,text,uuid,jsonb,timestamptz,boolean) to authenticated;

-- Se conserva íntegra la gestión anterior para abrir, pausar, anunciar y editar.
alter function public.manage_ff_room(text,jsonb) rename to manage_ff_room_before_results;
revoke all on function public.manage_ff_room_before_results(text,jsonb) from public,anon,authenticated;
create function public.manage_ff_room(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; kind text:=p_data->>'room_kind'; room_uuid uuid:=(p_data->>'room_id')::uuid; target_table text; next_status text;
begin
  if p_action not in('start','finish','cancel') then return manage_ff_room_before_results(p_action,p_data); end if;
  if not has_role(array['admin','revisor_arbitro']) or (p_action<>'start' and not is_admin()) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_data->>'edition_id' is distinct from current_edition_id()::text then raise exception 'La edición cambió'; end if;
  r:=ff_room_data(kind,room_uuid);
  if (r->>'edition_id')::uuid is distinct from current_edition_id() then raise exception 'Sala de otra edición'; end if;
  target_table:=case when kind='solo_top' then 'solo_top_rooms' else 'duo_rooms' end;
  if p_action='start' then
    if r->>'status'<>'closed' then raise exception 'Cierra las inscripciones antes de iniciar'; end if;
    if exists(select 1 from ff_room_registrations where room_kind=kind and room_id=room_uuid and status='pending') then raise exception 'Revisa todas las solicitudes pendientes'; end if;
    if not exists(select 1 from ff_room_registrations where room_kind=kind and room_id=room_uuid and status='approved') then raise exception 'Se requiere al menos un aprobado'; end if;
    next_status:='playing';
  elsif p_action='finish' then
    if r->>'status'<>'playing' then raise exception 'La sala no está en juego'; end if;
    if exists(select 1 from ff_room_registrations a where a.room_id=room_uuid and a.room_kind=kind and a.status='approved' and not exists(select 1 from ff_room_results s where s.registration_id=a.id)) then raise exception 'Guarda los resultados de todos los aprobados'; end if;
    if (select count(*) from ff_room_results where room_id=room_uuid and room_kind=kind and booyah)<>1 then raise exception 'Indica un único ganador antes de finalizar'; end if;
    insert into ff_room_payments(registration_id,edition_id,room_kind,room_id,concept,amount)
      select a.id,a.edition_id,kind,room_uuid,'reward',
        case when kind='duo_kills' then (s.kills_1+s.kills_2)*(r->>'kill_reward')::numeric+case when s.booyah then (r->>'booyah_reward')::numeric else 0 end
        else coalesce((select p.amount from solo_top_room_prizes p where kind='solo_top' and p.room_id=room_uuid and p.place=s.placement),
          (select p.amount from duo_room_prizes p where kind='duo_top' and p.room_id=room_uuid and p.place=s.placement),0) end
      from ff_room_registrations a join ff_room_results s on s.registration_id=a.id where a.room_kind=kind and a.room_id=room_uuid and a.status='approved';
    next_status:='finished';
  else
    if r->>'status' not in('draft','open','closed','playing') then raise exception 'Esta sala ya terminó'; end if;
    if p_data->>'confirmation' is distinct from r->>'name' then raise exception 'Escribe el nombre exacto de la sala'; end if;
    insert into ff_room_payments(registration_id,edition_id,room_kind,room_id,concept,amount)
      select id,edition_id,kind,room_uuid,'refund',amount_due from ff_room_registrations where room_kind=kind and room_id=room_uuid and status='approved';
    update ff_room_registrations set status=case when status='approved' and amount_due>0 then 'refund_pending' when status='approved' then 'refunded' else 'rejected' end,
      reason='Sala cancelada',reviewed_at=now(),reviewed_by=auth.uid() where room_kind=kind and room_id=room_uuid and status in('approved','pending');
    next_status:='cancelled';
  end if;
  execute format('update public.%I set status=$1,is_paused=false where id=$2',target_table) using next_status,room_uuid;
  return jsonb_build_object('id',room_uuid,'status',next_status);
end $$;
revoke all on function public.manage_ff_room(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ff_room(text,jsonb) to authenticated;

create function public.pay_ff_room_payment(p_edition_id uuid,p_payment_id uuid,p_amount numeric,p_phone text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payment ff_room_payments%rowtype; person ff_room_registrations%rowtype; room_data jsonb; payment_kind text; payment_room uuid;
begin
  if not is_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió'; end if;
  select room_kind,room_id into payment_kind,payment_room from ff_room_payments where id=p_payment_id and edition_id=p_edition_id;
  if not found then raise exception 'Pago no encontrado'; end if;
  room_data:=ff_room_data(payment_kind,payment_room);
  select * into payment from ff_room_payments where id=p_payment_id for update;
  if payment.paid_at is not null then return to_jsonb(payment); end if;
  select * into person from ff_room_registrations where id=payment.registration_id for update;
  if payment.amount<=0 then raise exception 'No hay importe que pagar'; end if;
  if p_amount is distinct from payment.amount or p_phone is distinct from person.prize_yape_phone then raise exception 'El importe o el Yape cambió. Actualiza y verifica el destino'; end if;
  if p_reference is null or char_length(btrim(p_reference)) not between 1 and 200 then raise exception 'Indica la referencia del pago (1 a 200 caracteres)'; end if;
  if (payment.concept='reward' and room_data->>'status'<>'finished') or (payment.concept='refund' and room_data->>'status'<>'cancelled') then raise exception 'La sala no admite este pago'; end if;
  update ff_room_payments set paid_at=now(),paid_by=auth.uid(),paid_phone=p_phone,reference=btrim(p_reference) where id=payment.id returning * into payment;
  if payment.concept='refund' then update ff_room_registrations set status='refunded' where id=person.id; end if;
  return to_jsonb(payment);
end $$;
revoke all on function public.pay_ff_room_payment(uuid,uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public.pay_ff_room_payment(uuid,uuid,numeric,text,text) to authenticated;

create function public.update_ff_room_phones(p_edition_id uuid,p_registration_id uuid,p_whatsapp text,p_prize_yape_phone text)
returns void language plpgsql security definer set search_path=public as $$
declare person ff_room_registrations%rowtype; room_data jsonb;
begin
  if not is_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió'; end if;
  select * into person from ff_room_registrations where id=p_registration_id and edition_id=p_edition_id;
  if not found then raise exception 'Inscripción no encontrada'; end if;
  room_data:=ff_room_data(person.room_kind,person.room_id);
  if p_whatsapp is null or p_prize_yape_phone is null or p_whatsapp !~ '^[0-9]{8,15}$' or p_prize_yape_phone !~ '^[0-9]{8,15}$' then raise exception 'Usa números de 8 a 15 dígitos'; end if;
  update ff_room_registrations set whatsapp=p_whatsapp,prize_yape_phone=p_prize_yape_phone where id=person.id;
end $$;
revoke all on function public.update_ff_room_phones(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_ff_room_phones(uuid,uuid,text,text) to authenticated;

create view public.public_ff_room_results as
  select a.id,a.room_id,a.room_kind,a.slot,a.nickname_1,a.nickname_2,
    case when r.status='finished' then s.placement end as placement,
    case when r.status='finished' then s.kills_1 end as kills_1,
    case when r.status='finished' then s.kills_2 end as kills_2,
    case when r.status='finished' then s.booyah end as booyah,
    case when r.status='finished' then p.amount end as earnings
  from ff_room_registrations a join public_ff_rooms r on r.id=a.room_id and r.room_kind=a.room_kind
    left join ff_room_results s on s.registration_id=a.id
    left join ff_room_payments p on p.registration_id=a.id and p.concept='reward'
  where a.status='approved' and r.status not in('draft','cancelled');
revoke all on public.public_ff_room_results from public,anon,authenticated;
grant select on public.public_ff_room_results to anon,authenticated;

do $$ declare definition text; patched text; begin
  definition:=pg_get_functiondef('public.edition_close_preview()'::regprocedure);
  patched:=replace(definition,'''Liquidaciones Solo pendientes'',','''Liquidaciones nuevas Free Fire pendientes'',(select count(*) from ff_room_payments where edition_id=current_edition_id() and amount>0 and paid_at is null),''Liquidaciones Solo pendientes'',');
  if patched=definition then raise exception 'No se pudo integrar el cierre de pagos'; end if;
  execute patched;
  definition:=pg_get_functiondef('public.close_tournament_edition(uuid,text,text,timestamptz)'::regprocedure);
  patched:=replace(definition,'''ff_room_registrations''] loop','''ff_room_registrations'',''ff_room_results'',''ff_room_payments''] loop');
  patched:=replace(patched,'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into rows_json from public_ff_rooms x;',
    'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into rows_json from public_ff_room_results x;
    public_data:=public_data||jsonb_build_object(''public_ff_room_results'',rows_json);
    select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into rows_json from public_ff_rooms x;');
  if patched=definition then raise exception 'No se pudo integrar el archivo de resultados'; end if;
  execute patched;
end $$;
insert into public.schema_migrations(version,description) values('032','Resultados y pagos de Solo Top, Dúo Top y Dúo por kills');
notify pgrst,'reload schema';
commit;
