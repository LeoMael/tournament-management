-- Verifica backfill y limpia únicamente la fixture del runner aislado.
do $$ begin
  if (select slot from solo_registrations where id='00000000-0000-0000-0000-000000001302') is distinct from 1
    or (select slot from solo_registrations where id='00000000-0000-0000-0000-000000001301') is distinct from 2 then
    raise exception 'TEST: backfill ignora orden de aprobación';
  end if;
  if not exists(select 1 from solo_results where registration_id='00000000-0000-0000-0000-000000001302' and kills=7 and booyah)
    or not exists(select 1 from solo_payments where registration_id='00000000-0000-0000-0000-000000001302' and amount=17) then
    raise exception 'TEST: backfill alteró resultados o pagos';
  end if;
end $$;
delete from solo_payments where registration_id in ('00000000-0000-0000-0000-000000001301','00000000-0000-0000-0000-000000001302');
delete from solo_results where room_id='00000000-0000-0000-0000-000000001300';
delete from solo_registrations where room_id='00000000-0000-0000-0000-000000001300';
delete from solo_rooms where id='00000000-0000-0000-0000-000000001300';
