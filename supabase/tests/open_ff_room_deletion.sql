begin;
create function pg_temp.delete_room_for_test(kind text,edition uuid,room_id uuid,confirmation text) returns jsonb language plpgsql as $$
begin
  if kind='solo_kills' then return delete_solo_room(edition,room_id,confirmation); end if;
  return manage_ff_room('delete',jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',room_id,'confirmation',confirmation));
end $$;
do $$
declare edition uuid:=current_edition_id(); kind text; phase text; room_id uuid; draft jsonb; cfg jsonb; payload jsonb; person uuid; persons uuid[]; receipt text; i integer; room_name text; keeper uuid; keep_data jsonb;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '10 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Otra sala intacta',now()+interval '2 days',now()+interval '1 day',48,2,1,5,'draft') returning id into keeper;
  select to_jsonb(r) into keep_data from solo_rooms r where id=keeper;
  foreach kind in array array['solo_kills','solo_top','duo_top','duo_kills'] loop
    foreach phase in array array['open','paused','closed'] loop
      room_name:='Borrar '||kind||' '||phase;
      draft:=jsonb_build_object('edition_id',edition,'name',room_name,'capacity',2,'entry_price',2,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(10));
      if kind='solo_kills' then
        insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
          values(room_name,now()+interval '2 days',now()+interval '1 day',48,2,1,5,'open') returning id into room_id;
      elsif kind='solo_top' then room_id:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
      else
        draft:=draft||jsonb_build_object('mode',case when kind='duo_top' then 'top' else 'kills' end);
        if kind='duo_kills' then draft:=draft||jsonb_build_object('top_prizes',jsonb_build_array(),'kill_reward',1,'booyah_reward',5); end if;
        room_id:=(manage_duo_room_draft('create',draft)->>'id')::uuid;
      end if;
      cfg:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',room_id);
      if kind<>'solo_kills' then perform manage_ff_room('open',cfg); end if;
      persons:='{}';
      for i in 1..2 loop
        receipt:=gen_random_uuid()::text||'.png';
        insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
        payload:=cfg||jsonb_build_object('request_id',gen_random_uuid(),'full_name','Persona de prueba','whatsapp','93047580'||i,'prize_yape_phone','98888888'||i,'receipt_path',receipt);
        if kind='solo_kills' then
          person:=(submit_solo_registration(payload||jsonb_build_object('nickname','Jugador '||i))->>'id')::uuid;
          if i=1 then perform manage_solo('review',cfg||jsonb_build_object('registration_id',person,'status','approved')); end if;
        else
          person:=(submit_ff_room_registration(payload||jsonb_build_object('nickname_1','Jugador '||i,'nickname_2',case when kind<>'solo_top' then 'Compañero '||i end))->>'id')::uuid;
          if i=1 then perform review_ff_room_registration(edition,kind,room_id,person,'approved',''); end if;
        end if;
        persons:=array_append(persons,person);
      end loop;
      if kind='solo_kills' then
        perform save_solo_room_access(edition,room_id,'12345','SECRET-OPEN-DELETE');
        if phase='paused' then perform set_solo_room_paused(edition,room_id,true);
        elsif phase='closed' then perform manage_solo('close',cfg); end if;
      else
        perform save_ff_room_access(edition,kind,room_id,'12345','SECRET-OPEN-DELETE');
        if phase='paused' then perform manage_ff_room('pause',cfg||jsonb_build_object('is_paused',true));
        elsif phase='closed' then perform manage_ff_room('close',cfg); end if;
      end if;
      perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
      begin perform pg_temp.delete_room_for_test(kind,edition,room_id,room_name); raise exception 'TEST: revisor elimina abierta'; exception when insufficient_privilege then null; end;
      perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      begin perform pg_temp.delete_room_for_test(kind,edition,room_id,'Otro nombre'); raise exception 'TEST: elimina sin nombre exacto';
      exception when raise_exception then if sqlerrm not like 'Escribe el nombre exacto%' then raise; end if; end;
      begin perform pg_temp.delete_room_for_test(kind,gen_random_uuid(),room_id,room_name); raise exception 'TEST: elimina desde otra edición';
      exception when raise_exception then if sqlerrm not like 'La edición cambió%' then raise; end if; end;
      perform pg_temp.delete_room_for_test(kind,edition,room_id,room_name);
      set constraints all immediate;
      if exists(select 1 from solo_rooms where id=room_id) or exists(select 1 from solo_top_rooms where id=room_id) or exists(select 1 from duo_rooms where id=room_id) then raise exception 'TEST: sala no eliminada'; end if;
      if exists(select 1 from solo_registrations where id=any(persons)) or exists(select 1 from ff_room_registrations where id=any(persons)) then raise exception 'TEST: deja inscripciones'; end if;
      if exists(select 1 from solo_room_access a where a.room_id=(cfg->>'room_id')::uuid) or exists(select 1 from ff_room_access a where a.room_id=(cfg->>'room_id')::uuid) then raise exception 'TEST: deja credenciales'; end if;
      if not exists(select 1 from audit_log where op='DELETE' and old_data->>'id'=persons[1]::text) or not exists(select 1 from audit_log where op='DELETE' and old_data->>'id'=persons[2]::text) then raise exception 'TEST: falta auditoría de pendientes/aprobados'; end if;
      if not exists(select 1 from storage.objects where name=receipt) then raise exception 'TEST: borra comprobante'; end if;
      if keep_data is distinct from (select to_jsonb(r) from solo_rooms r where id=keeper) then raise exception 'TEST: modifica otra sala'; end if;
      set constraints all deferred;
    end loop;
  end loop;
end $$;
rollback;
