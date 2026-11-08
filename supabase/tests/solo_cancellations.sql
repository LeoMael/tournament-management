begin;
do $$
declare e uuid:=current_edition_id(); room uuid; room2 uuid; reg uuid; second_reg uuid; payload jsonb; result jsonb; path text; i int;
begin
  update tournament_settings set registration_open=true,solo_enabled=true,registration_deadline=now()+interval '20 days';
  update games set is_open=false where key='ff'; -- Solo no depende de escuadras.
  for i in 1..2 loop
    result:=manage_solo('create',jsonb_build_object('edition_id',e,'name','Sala '||i,'scheduled_at',now()+interval '2 days','closes_at',now()+interval '1 day','capacity',2,'entry_price',3*i,'kill_reward',i,'booyah_reward',10*i));
    if i=1 then room:=(result->>'id')::uuid; else room2:=(result->>'id')::uuid; end if;
    perform manage_solo('open',jsonb_build_object('edition_id',e,'room_id',result->>'id'));
    path:=gen_random_uuid()::text||'.png';
    insert into storage.objects(bucket_id,name,metadata) values('receipts',path,'{"mimetype":"image/png","size":100}');
    payload:=jsonb_build_object('edition_id',e,'room_id',result->>'id','request_id',gen_random_uuid(),'full_name','Jugador Prueba','whatsapp','999999999','nickname','Player','receipt_path',path);
    result:=submit_solo_registration(payload);
    if i=1 then reg:=(result->>'id')::uuid; else second_reg:=(result->>'id')::uuid; end if;
  end loop;
  if (select count(*) from solo_registrations where nickname='Player')<>2 then raise exception 'TEST: no permite varias salas'; end if;
  perform manage_solo('review',jsonb_build_object('edition_id',e,'room_id',room,'registration_id',reg,'status','approved'));
  perform manage_solo('cancel',jsonb_build_object('edition_id',e,'room_id',room,'reason','Sala cancelada'));
  if (select amount from solo_payments where registration_id=reg and kind='refund')<>3 or (select status from solo_registrations where id=reg)<>'refund_pending' then raise exception 'TEST: devolución incorrecta'; end if;
  perform manage_solo('pay',jsonb_build_object('edition_id',e,'room_id',room,'payment_id',(select id from solo_payments where registration_id=reg)));
  if (select status from solo_registrations where id=reg)<>'refunded' then raise exception 'TEST: no liquidó devolución'; end if;
  perform manage_solo('cancel',jsonb_build_object('edition_id',e,'room_id',room2,'reason','No se realizó'));
  if (select status from solo_registrations where id=second_reg)<>'rejected' or exists(select 1 from solo_payments where registration_id=second_reg) then raise exception 'TEST: devolvió solicitud sin pago aprobado'; end if;
  if exists(select 1 from jsonb_each_text(edition_close_preview()->'blockers') where value::int>0) then raise exception 'TEST: cancelación dejó pendientes'; end if;
end $$;
rollback;
