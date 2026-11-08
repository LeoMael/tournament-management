begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='011') then raise exception 'Se requiere 011'; end if;
end $$;

create function public.save_solo_results(p_edition_id uuid,p_room_id uuid,p_results jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r solo_rooms%rowtype; item jsonb; ids uuid[]:='{}'; player_id uuid; booyahs integer:=0;
begin
  if not has_role(array['admin','revisor_arbitro']) then raise exception 'Sin permisos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(724091);
  if p_edition_id is distinct from current_edition_id() then raise exception 'La edición cambió. Actualiza la página.'; end if;
  select * into r from solo_rooms where id=p_room_id for update;
  if not found or r.edition_id is distinct from p_edition_id then raise exception 'Sala no encontrada en esta edición'; end if;
  if r.status <> 'playing' then raise exception 'Solo se pueden editar resultados durante la partida'; end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then raise exception 'Envía los resultados de toda la sala'; end if;
  if jsonb_array_length(p_results) not between 1 and 100 then raise exception 'Cantidad de resultados inválida'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(jsonb_typeof(item->'kills'),'null') <> 'number'
       or coalesce(item->>'kills','') !~ '^[0-9]{1,4}$'
       or (item->>'kills')::integer > 1000
       or coalesce(jsonb_typeof(item->'booyah'),'null') <> 'boolean' then
      raise exception 'Kills inválidas: usa enteros de 0 a 1000 y un indicador Booyah válido';
    end if;
    player_id:=(item->>'registration_id')::uuid;
    if player_id is null or player_id=any(ids) or not exists(
      select 1 from solo_registrations where id=player_id and room_id=r.id and status='approved'
    ) then raise exception 'Jugador duplicado o no aprobado en esta sala'; end if;
    ids:=array_append(ids,player_id);
    if (item->>'booyah')::boolean then booyahs:=booyahs+1; end if;
  end loop;
  if booyahs>1 then raise exception 'Selecciona un único Booyah'; end if;
  if cardinality(ids) <> (select count(*) from solo_registrations where room_id=r.id and status='approved') then
    raise exception 'Incluye a todos los jugadores aprobados, también los ocultos por el buscador';
  end if;
  -- Libera el Booyah anterior antes de asignar al nuevo ganador.
  update solo_results set booyah=false where room_id=r.id and booyah;
  insert into solo_results(registration_id,room_id,kills,booyah)
    select (value->>'registration_id')::uuid,r.id,(value->>'kills')::integer,(value->>'booyah')::boolean
    from jsonb_array_elements(p_results)
    on conflict(registration_id) do update set kills=excluded.kills,booyah=excluded.booyah;
  return (select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from solo_results s where room_id=r.id);
end $$;

revoke all on function public.save_solo_results(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_solo_results(uuid,uuid,jsonb) to authenticated;
insert into public.schema_migrations(version,description) values('012','Guardar todos los resultados de una sala Solo en una transacción');
commit;
