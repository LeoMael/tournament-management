do $$ begin
  if exists(select 1 from registrations r join team_phone_snapshot p using(id)
    where (to_jsonb(r)-'prize_yape_phone') is distinct from p.original or r.prize_yape_phone is distinct from
      case when r.team_name='Previo Yape 3' then '912345678' else r.captain_whatsapp end) then
    raise exception 'TEST: backfill cambió datos o sobrescribió Yape previo'; end if;
end $$;
delete from registrations where id in(select id from team_phone_snapshot);
drop table team_phone_snapshot;
