-- =====================================================================
-- DATOS DE PRUEBA: 16 equipos MLBB + 12 equipos Free Fire con rosters completos.
-- Ejecutar en el SQL Editor de Supabase (corre como postgres, salta RLS).
--
-- * Mezcla de estados: aprobados, pendientes y rechazados.
-- * Todos usan receipt_path 'test-...' => sirven para borrarlos de una vez
--   con test_teams_cleanup.sql. No tienen archivo real en Storage, así que
--   al abrir el comprobante en el panel verás un aviso de "Object not found".
-- * Es seguro repetirlo: no duplica equipos ya cargados.
-- Requisitos: haber ejecutado 01_schema.sql y 02_seed.sql.
-- =====================================================================

do $$
declare
  mlbb_names text[] := array[
    'Wolves UNAP', 'Titan Esports', 'Altiplano Gaming', 'Kuntur Squad',
    'Inca Legion', 'Qhapaq Team', 'Lago Titicaca FC', 'Puma Rojo',
    'Suyu Warriors', 'Tahuantinsuyo', 'Cóndor Andino', 'Yatiri Esports',
    'Illimani Crew', 'Sicuani Storm', 'Aymara Kings', 'Wiracocha Team'
  ];
  ff_names text[] := array[
    'Booyah Puno', 'Fénix del Sur', 'Jaguar Squad', 'Chasqui Gaming',
    'Vicuña Elite', 'Tormenta Andina', 'Mallku Pro', 'Pachamama FF',
    'Yaku Raiders', 'Sol Naciente', 'Apu Legends', 'Nevado Crew'
  ];
  schools text[] := array[
    'Ingeniería de Sistemas', 'Ingeniería Civil', 'Medicina Humana', 'Derecho',
    'Administración', 'Ciencias Contables', 'Enfermería', 'Ingeniería Electrónica',
    'Psicología', 'Ingeniería Económica'
  ];
  others text[] := array['UANCV', 'TECSUP', 'IESTP Puno', 'Universidad Andina'];
  captains text[] := array[
    'Juan Pérez Quispe', 'Luis Mamani Condori', 'Carlos Huanca Apaza', 'Miguel Ccori Flores',
    'José Choque Ramos', 'Diego Salas Colque', 'Ángel Paredes Vilca', 'Rodrigo Cutipa Mayta',
    'Brayan Ticona Nina', 'Kevin Quispe Yucra', 'Pedro Larico Sucasaire', 'Marco Zea Cahuana'
  ];
  nick_bases text[] := array['Shadow', 'Nova', 'Rex', 'Blaze', 'Viper', 'Ghost', 'Hawk'];
  v_game text;
  v_names text[];
  v_count int;
  v_starters int;
  v_subs int;
  v_i int;
  v_slot int;
  v_status text;
  v_inst text;
  v_id uuid;
  v_nick text;
  v_players int;
begin
  foreach v_game in array array['mlbb', 'ff'] loop
    v_names := case v_game when 'mlbb' then mlbb_names else ff_names end;
    v_count := array_length(v_names, 1);
    select starters, substitutes into v_starters, v_subs from public.games where key = v_game;
    if v_starters is null then
      raise exception 'Falta la tabla games: ejecuta 01_schema.sql y 02_seed.sql primero.';
    end if;

    for v_i in 1 .. v_count loop
      -- ~70% aprobados, ~25% pendientes, ~5% rechazados
      v_status := case
        when v_i % 10 = 0 then 'rejected'
        when v_i % 4 = 0 then 'pending'
        else 'approved'
      end;
      v_inst := case when v_i % 5 = 0 then 'Otra' else 'UNAP' end;

      insert into public.registrations (
        game_key, team_name, captain_name, captain_whatsapp, institution,
        professional_school, other_institution, receipt_path, amount_due,
        status, rejection_reason, reviewed_at, created_at
      )
      select
        v_game, v_names[v_i], captains[(v_i - 1) % array_length(captains, 1) + 1],
        '9' || lpad((51000000 + v_i * 137 + case v_game when 'ff' then 5000 else 0 end)::text, 8, '0'),
        v_inst,
        schools[(v_i - 1) % array_length(schools, 1) + 1],
        case when v_inst = 'Otra' then others[(v_i - 1) % array_length(others, 1) + 1] end,
        'test-' || v_game || '-' || lpad(v_i::text, 3, '0') || '.png',
        g.price,
        v_status,
        case when v_status = 'rejected' then 'Comprobante ilegible, vuelve a enviarlo.' end,
        case when v_status <> 'pending' then now() - (v_i || ' hours')::interval end,
        now() - ((v_count - v_i) * 5 + 2 || ' hours')::interval
      from public.games g
      where g.key = v_game
      on conflict do nothing
      returning id into v_id;

      -- Si el equipo ya existía, no se vuelven a crear sus jugadores.
      continue when v_id is null;

      -- Roster completo; algunos equipos con suplentes.
      v_players := v_starters + case when v_i % 2 = 0 then v_subs else 0 end;
      for v_slot in 1 .. v_players loop
        v_nick := nick_bases[(v_i + v_slot) % array_length(nick_bases, 1) + 1] || initcap(split_part(v_names[v_i], ' ', 1)) || v_slot;
        insert into public.players (registration_id, game_key, slot, is_substitute, nickname, game_player_id, server_id)
        values (
          v_id, v_game, v_slot, v_slot > v_starters,
          left(case when v_slot = 1 then 'Cap' || initcap(split_part(v_names[v_i], ' ', 1)) else v_nick end, 30),
          -- ID único por juego/equipo/slot: 10 dígitos
          (case v_game when 'mlbb' then '7' else '8' end) || lpad(v_i::text, 3, '0') || lpad(v_slot::text, 2, '0') || '4821',
          case when v_game = 'mlbb' then (2000 + (v_i * 7 + v_slot) % 900)::text end
        );
      end loop;
    end loop;
  end loop;
end $$;

-- Resumen de lo cargado
select game_key as juego, status as estado, count(*) as equipos, sum(amount_due) as monto
from public.registrations
where receipt_path like 'test-%'
group by 1, 2
order by 1, 2;
