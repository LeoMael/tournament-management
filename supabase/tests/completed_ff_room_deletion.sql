begin;
create function pg_temp.block_completed_ff_delete() returns trigger language plpgsql as $$
begin
  if old.room_id::text=current_setting('test.block_ff_delete_room',true) then raise exception 'Borrado bloqueado para comprobar atomicidad'; end if;
  return old;
end $$;
create trigger test_atomic_completed_ff_delete before delete on ff_room_registrations for each row execute function pg_temp.block_completed_ff_delete();

do $$
declare edition uuid:=current_edition_id(); kind text; final_state text; config jsonb; draft jsonb; rid uuid; keeper uuid; saved_keeper jsonb;
  person uuid; receipt text; payment ff_room_payments%rowtype; payload jsonb; before_data jsonb; after_data jsonb; old_solo uuid; old_solo_data jsonb;
begin
  update tournament_settings set registration_open=true,registration_deadline=now()+interval '10 days';
  insert into solo_rooms(name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
    values('Solo por kills intacto',now()+interval '2 days',now()+interval '1 day',48,2,1,5,'finished') returning id into old_solo;
  select to_jsonb(s) into old_solo_data from solo_rooms s where id=old_solo;
  foreach kind in array array['solo_top','duo_top','duo_kills'] loop
    draft:=jsonb_build_object('edition_id',edition,'name','Otra sala '||kind,'capacity',2,'entry_price',2,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','top_prizes',jsonb_build_array(10));
    if kind='solo_top' then keeper:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
    else
      draft:=draft||jsonb_build_object('mode',case when kind='duo_top' then 'top' else 'kills' end);
      if kind='duo_kills' then draft:=draft||jsonb_build_object('top_prizes',jsonb_build_array(),'kill_reward',1,'booyah_reward',5); end if;
      keeper:=(manage_duo_room_draft('create',draft)->>'id')::uuid;
    end if;
    saved_keeper:=ff_room_data(kind,keeper);
    foreach final_state in array array['finished','cancelled'] loop
      draft:=draft||jsonb_build_object('name','Eliminar '||kind||' '||final_state);
      if kind='solo_top' then rid:=(manage_solo_top_room_draft('create',draft)->>'id')::uuid;
      else rid:=(manage_duo_room_draft('create',draft)->>'id')::uuid; end if;
      config:=jsonb_build_object('edition_id',edition,'room_kind',kind,'room_id',rid,'confirmation',draft->>'name');
      perform manage_ff_room('open',config);
      receipt:=gen_random_uuid()::text||'.png';
      insert into storage.objects(bucket_id,name,metadata) values('receipts',receipt,'{"mimetype":"image/png","size":100}');
      person:=(submit_ff_room_registration(config||jsonb_build_object('request_id',gen_random_uuid(),'full_name','Nombre de prueba','whatsapp','930475802','prize_yape_phone','988888888','nickname_1','Jugador A','nickname_2',case when kind<>'solo_top' then 'Jugador B' end,'receipt_path',receipt))->>'id')::uuid;
      begin perform manage_ff_room('delete',config); raise exception 'TEST: elimina abierta con inscritos';
      exception when raise_exception then if sqlerrm<>'Esta sala tiene inscripciones. Conserva su historial.' then raise; end if; end;
      perform review_ff_room_registration(edition,kind,rid,person,'approved','');
      perform save_ff_room_access(edition,kind,rid,'12345','SECRET-DELETE-ACCESS');
      perform manage_ff_room('close',config);
      perform manage_ff_room('start',config);
      payload:=jsonb_build_array(jsonb_build_object('registration_id',person,'placement',1,'kills_1',2,'kills_2',case when kind='solo_top' then 0 else 1 end,'booyah',true));
      perform save_ff_room_results(edition,kind,rid,payload);
      begin perform manage_ff_room('delete',config); raise exception 'TEST: elimina sala en juego';
      exception when raise_exception then if sqlerrm<>'La sala ya está en juego o finalizada' then raise; end if; end;
      if final_state='finished' then perform manage_ff_room('finish',config);
      else perform manage_ff_room('cancel',config); end if;
      select * into payment from ff_room_payments where room_id=rid;
      -- Cubre premios y devoluciones tanto registrados como pendientes.
      if kind='solo_top' or (kind='duo_kills' and final_state='cancelled') then
        perform pay_ff_room_payment(edition,payment.id,payment.amount,'988888888','Pago histórico de prueba');
      end if;
      perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
      begin perform manage_ff_room('delete',config); raise exception 'TEST: revisor elimina'; exception when insufficient_privilege then null; end;
      perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
      begin perform manage_ff_room('delete',config); raise exception 'TEST: editor elimina'; exception when insufficient_privilege then null; end;
      perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      begin perform manage_ff_room('delete',config||jsonb_build_object('confirmation','Incorrecto')); raise exception 'TEST: elimina sin nombre exacto';
      exception when raise_exception then if sqlerrm<>'Escribe el nombre exacto de la sala' then raise; end if; end;
      begin perform manage_ff_room('delete',config||jsonb_build_object('edition_id',gen_random_uuid())); raise exception 'TEST: elimina desde otra edición';
      exception when raise_exception then if sqlerrm<>'La edición cambió. Actualiza la página.' then raise; end if; end;

      if kind='solo_top' and final_state='finished' then
        before_data:=jsonb_build_object('room',ff_room_data(kind,rid),
          'registration',(select to_jsonb(a) from ff_room_registrations a where id=person),
          'result',(select to_jsonb(s) from ff_room_results s where registration_id=person),
          'payment',(select to_jsonb(p) from ff_room_payments p where registration_id=person),
          'audit_count',(select count(*) from audit_log));
        perform set_config('test.block_ff_delete_room',rid::text,true);
        begin perform manage_ff_room('delete',config); raise exception 'TEST: no se probó rollback';
        exception when raise_exception then if sqlerrm<>'Borrado bloqueado para comprobar atomicidad' then raise; end if; end;
        perform set_config('test.block_ff_delete_room','',true);
        after_data:=jsonb_build_object('room',ff_room_data(kind,rid),
          'registration',(select to_jsonb(a) from ff_room_registrations a where id=person),
          'result',(select to_jsonb(s) from ff_room_results s where registration_id=person),
          'payment',(select to_jsonb(p) from ff_room_payments p where registration_id=person),
          'audit_count',(select count(*) from audit_log));
        if before_data is distinct from after_data then raise exception 'TEST: eliminación parcial después de error'; end if;
      end if;
      if (manage_ff_room('delete',config)->>'deleted')::boolean is distinct from true then raise exception 'TEST: eliminación no confirmada'; end if;
      set constraints all immediate;
      if exists(select 1 from ff_room_registrations where room_id=rid)
        or exists(select 1 from ff_room_results where room_id=rid)
        or exists(select 1 from ff_room_payments where room_id=rid)
        or exists(select 1 from ff_room_access where room_id=rid)
        or exists(select 1 from solo_top_room_prizes where room_id=rid)
        or exists(select 1 from duo_room_prizes where room_id=rid)
        or exists(select 1 from solo_top_rooms where id=rid)
        or exists(select 1 from duo_rooms where id=rid)
        or exists(select 1 from public_ff_rooms where id=rid)
        or exists(select 1 from public_ff_room_results where room_id=rid) then raise exception 'TEST: eliminación deja filas asociadas o públicas'; end if;
      if not exists(select 1 from audit_log where table_name='ff_room_payments' and op='DELETE' and old_data->>'id'=payment.id::text)
        or not exists(select 1 from audit_log where table_name='ff_room_registrations' and op='DELETE' and old_data->>'id'=person::text)
        or not exists(select 1 from audit_log where table_name='ff_room_results' and op='DELETE' and old_data->>'room_id'=rid::text)
        or not exists(select 1 from audit_log where table_name in('duo_rooms','solo_top_rooms') and op='DELETE' and old_data->>'id'=rid::text) then raise exception 'TEST: falta auditoría de la eliminación'; end if;
      if exists(select 1 from audit_log a where to_jsonb(a)::text like '%SECRET-DELETE-ACCESS%') then raise exception 'TEST: contraseña en auditoría'; end if;
      if not exists(select 1 from storage.objects where bucket_id='receipts' and name=receipt) then raise exception 'TEST: borra comprobante de Storage'; end if;
      if saved_keeper is distinct from ff_room_data(kind,keeper) then raise exception 'TEST: modifica otra sala'; end if;
      if old_solo_data is distinct from (select to_jsonb(s) from solo_rooms s where id=old_solo) then raise exception 'TEST: modifica Solo por kills'; end if;
      set constraints all deferred;
    end loop;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform manage_ff_room('delete','{}'); raise exception 'TEST: anon elimina'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform manage_ff_room_before_completed_deletion('delete','{}'); raise exception 'TEST: helper antiguo expuesto'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
