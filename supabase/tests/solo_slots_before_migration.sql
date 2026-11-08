-- Fixture efímera del runner, antes de aplicar 013. No ejecutar sobre producción.
insert into solo_rooms(id,name,scheduled_at,closes_at,capacity,entry_price,kill_reward,booyah_reward,status)
values('00000000-0000-0000-0000-000000001300','Backfill slots',now()+interval '2 days',now()+interval '1 day',2,2,1,10,'finished');
insert into solo_registrations(id,room_id,request_id,request_fingerprint,full_name,whatsapp,nickname,receipt_path,amount_due,status,created_at,reviewed_at) values
('00000000-0000-0000-0000-000000001301','00000000-0000-0000-0000-000000001300',gen_random_uuid(),'late','Inscrito primero','999999999','Primero','slot-backfill-one.png',2,'approved',now()-interval '3 hours',now()-interval '1 hour'),
('00000000-0000-0000-0000-000000001302','00000000-0000-0000-0000-000000001300',gen_random_uuid(),'early','Aprobado primero','999999998','Segundo','slot-backfill-two.png',2,'approved',now()-interval '2 hours',now()-interval '90 minutes');
insert into solo_results(registration_id,room_id,kills,booyah) values('00000000-0000-0000-0000-000000001302','00000000-0000-0000-0000-000000001300',7,true);
insert into solo_payments(registration_id,kind,amount) values('00000000-0000-0000-0000-000000001302','reward',17);
