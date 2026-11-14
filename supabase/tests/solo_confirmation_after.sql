do $$ begin
  if exists(select 1 from solo_registrations p join prior_confirmation_rows a using(id)
    where (to_jsonb(p)-'confirmation_click_count') is distinct from a.original
      or p.confirmation_click_count<>(case when p.status='approved' then 1 else 0 end)) then
    raise exception 'TEST: contador inicial incorrecto o datos modificados'; end if;
end $$;
delete from solo_registrations where room_id='00000000-0000-0000-0000-000000002200';
delete from solo_rooms where id='00000000-0000-0000-0000-000000002200';
drop table prior_confirmation_rows;
