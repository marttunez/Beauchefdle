-- =====================================================================
-- FASE 2 — Usuarios + ranking con un puntaje por persona por día
-- Úsalo cuando agregues login (Supabase Auth). Reemplaza la tabla "leaderboard" de la fase 1.
--
-- Antes, en el panel de Supabase → Authentication → Sign In / Providers:
--   * Activa "Allow anonymous sign-ins"  (jugar sin registrarse, pero con un id estable)
--   * Y/o activa Email (magic link / código) o Google, para cuentas permanentes.
-- =====================================================================

-- ---------- Perfiles: el apodo público de cada usuario ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  apodo      text not null check (char_length(apodo) between 2 and 20),
  created_at timestamptz not null default now()
);
-- Apodo único sin distinguir mayúsculas ("Ana" y "ana" son el mismo).
create unique index if not exists profiles_apodo_unico on public.profiles (lower(apodo));

alter table public.profiles enable row level security;

drop policy if exists "ver perfiles"     on public.profiles;
drop policy if exists "crear mi perfil"  on public.profiles;
drop policy if exists "editar mi perfil" on public.profiles;

create policy "ver perfiles" on public.profiles for select
  using (true);
create policy "crear mi perfil" on public.profiles for insert
  to authenticated
  with check (id = auth.uid());
  -- Opcional: solo correos de la U (quita los "--" de la línea siguiente y ajústala):
  -- with check (id = auth.uid() and (auth.jwt() ->> 'email') ~* '@(ug\.)?uchile\.cl$');
create policy "editar mi perfil" on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- Puntajes: uno por usuario por día ----------
create table if not exists public.scores (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  fecha     date        not null default ((now() at time zone 'America/Santiago')::date),
  intentos  smallint    not null check (intentos between 1 and 6),
  gano      boolean     not null,
  creado_en timestamptz not null default now(),
  primary key (user_id, fecha),           -- evita puntajes repetidos aunque borren el localStorage
  check (gano or intentos = 6)
);

alter table public.scores enable row level security;

drop policy if exists "ver puntajes" on public.scores;
create policy "ver puntajes" on public.scores for select
  using (true);
-- No hay política de insert/update/delete: nadie escribe directo en la tabla.
-- Los puntajes entran SOLO por la función submit_score (abajo), que usa el usuario
-- autenticado y la fecha del servidor, no la del navegador.
revoke insert, update, delete, truncate on public.scores from anon, authenticated;

create or replace function public.submit_score(p_intentos int, p_gano boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para guardar tu puntaje';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Primero elige un apodo';
  end if;
  if p_intentos not between 1 and 6 or (not p_gano and p_intentos <> 6) then
    raise exception 'Puntaje inválido';
  end if;

  insert into public.scores (user_id, intentos, gano)
  values (auth.uid(), p_intentos, p_gano)
  on conflict (user_id, fecha) do nothing;   -- ya guardó hoy: se ignora
end;
$$;

revoke all on function public.submit_score(int, boolean) from public;
grant execute on function public.submit_score(int, boolean) to authenticated;

-- ---------- Vista para el ranking del día ----------
-- Se consulta como una tabla: /rest/v1/ranking_diario?fecha=eq.2026-10-16&order=gano.desc,intentos.asc,creado_en.asc&limit=20
create or replace view public.ranking_diario
with (security_invoker = true) as
select s.fecha, p.apodo, s.intentos, s.gano, s.creado_en
from public.scores s
join public.profiles p on p.id = s.user_id;

grant select on public.ranking_diario to anon, authenticated;