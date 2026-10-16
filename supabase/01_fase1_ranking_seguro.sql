-- =====================================================================
-- FASE 1 — Ranking seguro (funciona con el cliente actual, sin cuentas)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
--
-- Por qué importa: la clave "publishable" va en el navegador y cualquiera puede verla.
-- Lo que protege tu base NO es esconder la clave, sino Row Level Security (RLS):
-- con estas reglas, desde el navegador solo se puede LEER el ranking e INSERTAR
-- un puntaje válido de hoy. No se puede editar ni borrar nada.
-- =====================================================================

-- 1) La tabla (si ya existía, se deja como está y se ajusta más abajo).
create table if not exists public.leaderboard (
  id        bigint generated always as identity primary key,
  fecha     date        not null,
  apodo     text        not null check (char_length(apodo) between 2 and 20),
  intentos  smallint    not null check (intentos between 1 and 6),
  gano      boolean     not null,
  creado_en timestamptz not null default now(),
  check (gano or intentos = 6)          -- si perdió, usó los 6 intentos
);

alter table public.leaderboard enable row level security;

-- 2) Borra TODAS las políticas anteriores de esta tabla (por ejemplo una tipo
--    "allow all" creada al probar), para que solo valgan las dos del paso 4.
--    Va antes del paso 3 porque Postgres no deja cambiar el tipo de una columna
--    que usa alguna política.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'leaderboard'
  loop
    execute format('drop policy %I on public.leaderboard', p.policyname);
  end loop;
end $$;

-- 3) Si la tabla ya existía con "fecha" como texto, conviértela a date
--    (el cliente sigue enviando '2026-10-16' y funciona igual).
--    Antes quita lo que estorba al cambiar de tipo: el valor por defecto y cualquier
--    CHECK antiguo sobre fecha (p. ej. una validación de formato con regex, que dejaría
--    de tener sentido: el tipo date ya valida el formato).
do $$
declare c record;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leaderboard'
               and column_name = 'fecha' and data_type <> 'date')
  then
    for c in select conname from pg_constraint
             where conrelid = 'public.leaderboard'::regclass
               and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%fecha%'
    loop
      execute format('alter table public.leaderboard drop constraint %I', c.conname);
    end loop;

    alter table public.leaderboard alter column fecha drop default;
    alter table public.leaderboard alter column fecha type date using fecha::date;
  end if;
end $$;

create index if not exists leaderboard_dia_idx
  on public.leaderboard (fecha, gano desc, intentos, creado_en);

-- 4) Las dos únicas reglas permitidas desde el navegador.

-- Cualquiera puede ver el ranking.
create policy "ver ranking"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

-- Cualquiera puede guardar un puntaje, pero solo del día de hoy en Chile y con datos coherentes.
create policy "guardar puntaje de hoy"
  on public.leaderboard for insert
  to anon, authenticated
  with check (
    fecha = (now() at time zone 'America/Santiago')::date
    and char_length(apodo) between 2 and 20
    and intentos between 1 and 6
    and (gano or intentos = 6)
  );

-- No hay políticas de update ni delete: con RLS activado quedan prohibidos.
-- Refuerzo: además quita los permisos.
revoke update, delete, truncate on public.leaderboard from anon, authenticated;

-- Para moderar (borrar un apodo ofensivo): hazlo tú desde el Table Editor del panel de Supabase.