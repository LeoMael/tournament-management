-- =====================================================================
-- DATOS DE PRUEBA: 24 equipos de Free Fire, TODOS APROBADOS, con roster completo.
-- Sirve para probar salas (24 equipos = 2 salas de 12), fases, clasificados y campeón.
-- Ejecutar en el SQL Editor de Supabase (corre como postgres, salta RLS).
--
-- * Reemplaza los equipos de prueba de Free Fire anteriores (receipt_path 'test-ff-%'),
--   así que se puede repetir sin acumular equipos. No toca los de MLBB.
-- * 24 = cupo de Free Fire en 02_seed.sql.
-- * Para borrarlos: test_teams_cleanup.sql (borra todos los de prueba, MLBB y Free Fire).
-- Requisitos: haber ejecutado 01_schema.sql y 02_seed.sql.
-- =====================================================================

delete from public.registrations where receipt_path like 'test-ff-%';

do $$
declare
  names text[] := array[
    'Booyah Puno', 'Fénix del Sur', 'Jaguar Squad', 'Chasqui Gaming',
    'Vicuña Elite', 'Tormenta Andina', 'Mallku Pro', 'Pachamama FF',
    'Yaku Raiders', 'Sol Naciente', 'Apu Legends', 'Nevado Crew',
    'Lobos del Altiplano', 'Quinua Gaming', 'Amaru Clan', 'Totora Squad',
    'Wayra Esports', 'Kori Warriors', 'Sumaq Team', 'Pukara FF',
    'Anka Elite', 'Intiwasi Crew', 'Llama Dorada', 'Ayni Gaming'
  ];
  schools text[] := array[
    'Ingeniería de Sistemas', 'Ingeniería Civil', 'Medicina Humana', 'Derecho',
    'Administración', 'Ciencias Contables', 'Enfermería', 'Ingeniería Electrónica',
    'Psicología', 'Ingeniería Económica', 'Educación Primaria', 'Biología'
  ];
  others text[] := array['UANCV', 'TECSUP', 'IESTP Puno', 'Universidad Andina'];
  captains text[] := array[
    'Juan Pérez Quispe', 'Luis Mamani Condori', 'Carlos Huanca Apaza', 'Miguel Ccori Flores',
    'José Choque Ramos', 'Diego Salas Colque', 'Ángel Paredes Vilca', 'Rodrigo Cutipa Mayta',
    'Brayan Ticona Nina', 'Kevin Quispe Yucra', 'Pedro Larico Sucasaire', 'Marco Zea Cahuana'
  ];
  nick_bases text[] := array['Shadow', 'Nova', 'Rex', 'Blaze', 'Viper', 'Ghost', 'Hawk'];
  v_starters int;
  v_subs int;
  v_i int;
  v_slot int;
  v_inst text;
  v_id uuid;
  v_players int;
begin
  select starters, substitutes into v_starters, v_subs from public.games where key = 'ff';
  if v_starters is null then
    raise exception 'Falta la tabla games: ejecuta 01_schema.sql y 02_seed.sql primero.';
  end if;

  for v_i in 1 .. array_length(names, 1) loop
    v_inst := case when v_i % 5 = 0 then 'Otra' else 'UNAP' end;

    insert into public.registrations (
      game_key, team_name, captain_name, captain_whatsapp, institution,
      professional_school, other_institution, receipt_path, amount_due,
      status, reviewed_at, created_at
    )
    select
      'ff', names[v_i], captains[(v_i - 1) % array_length(captains, 1) + 1],
      '9' || lpad((52000000 + v_i * 211)::text, 8, '0'),
      v_inst,
      schools[(v_i - 1) % array_length(schools, 1) + 1],
      case when v_inst = 'Otra' then others[(v_i - 1) % array_length(others, 1) + 1] end,
      'test-ff-b-' || lpad(v_i::text, 3, '0') || '.png',
      g.price, 'approved', now() - (v_i || ' hours')::interval, now() - ((30 - v_i) || ' hours')::interval
    from public.games g
    where g.key = 'ff'
    on conflict do nothing
    returning id into v_id;

    continue when v_id is null;

    -- 4 titulares; los equipos pares con suplente.
    v_players := v_starters + case when v_i % 2 = 0 then v_subs else 0 end;
    for v_slot in 1 .. v_players loop
      insert into public.players (registration_id, game_key, slot, is_substitute, nickname, game_player_id)
      values (
        v_id, 'ff', v_slot, v_slot > v_starters,
        left(case when v_slot = 1 then 'Cap' || initcap(split_part(names[v_i], ' ', 1))
                  else nick_bases[(v_i + v_slot) % array_length(nick_bases, 1) + 1] || initcap(split_part(names[v_i], ' ', 1)) || v_slot end, 30),
        -- ID único por equipo/slot: 10 dígitos
        '8' || lpad((100 + v_i)::text, 3, '0') || lpad(v_slot::text, 2, '0') || '4821'
      );
    end loop;
  end loop;
end $$;

-- Resumen de lo cargado
select game_key as juego, status as estado, count(*) as equipos
from public.registrations
where receipt_path like 'test-ff-%'
group by 1, 2;
