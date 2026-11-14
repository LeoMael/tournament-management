do $$ begin
  if exists(select 1 from solo_registrations a join prior_solo_phones p using(id)
    where to_jsonb(a)-'prize_yape_phone' is distinct from p.original
      or a.prize_yape_phone is distinct from case when a.nickname='Previo 3' then '912345678' else a.whatsapp end)
    then raise exception 'TEST: migración alteró datos previos o sobrescribió un Yape'; end if;
end $$;
delete from solo_registrations where room_id='00000000-0000-0000-0000-000000002100';
delete from solo_rooms where id='00000000-0000-0000-0000-000000002100';
drop table prior_solo_phones;
