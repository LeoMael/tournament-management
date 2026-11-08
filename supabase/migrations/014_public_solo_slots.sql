-- Completa la conexión de slots entre el panel y la web pública.
begin;
do $$ begin
  if not exists(select 1 from public.schema_migrations where version='013') then raise exception 'Se requiere 013'; end if;
end $$;

-- Conserva columnas, filtros y permisos; agrega únicamente el slot al final.
create or replace view public.public_solo_results as
 select a.id,a.room_id,a.nickname,
   case when r.status='finished' then s.kills end as kills,
   case when r.status='finished' then s.booyah end as booyah,
   case when r.status='finished' then s.kills*r.kill_reward+case when s.booyah then r.booyah_reward else 0 end end as earnings,
   a.slot
 from public.solo_registrations a join public.solo_rooms r on r.id=a.room_id left join public.solo_results s on s.registration_id=a.id
 where a.status='approved' and r.status not in ('draft','cancelled') and r.edition_id=public.current_edition_id();

insert into public.schema_migrations(version,description)
values('014','Mostrar slots asignados en la vista pública de Free Fire Solo');
commit;
