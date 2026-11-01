-- =====================================================================
-- Dragon Card Z — schéma Supabase (mode Online, phase 1)
-- À exécuter UNE fois dans Supabase : SQL Editor > New query > coller > Run.
-- Peut être relancé sans danger (crée seulement ce qui manque).
-- =====================================================================

-- ---------- Profils publics (pseudo, équipe de défense, vitrine) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null check (pseudo ~ '^[A-Za-z0-9_-]{3,16}$'),
  level       int  not null default 1 check (level between 1 and 9999),
  defense     jsonb not null default '{}'::jsonb check (pg_column_size(defense) < 8000),
  showcase    jsonb not null default '{}'::jsonb check (pg_column_size(showcase) < 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_pseudo_unique on public.profiles (lower(pseudo));

-- ---------- Sauvegardes privées ----------
create table if not exists public.saves (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null check (pg_column_size(data) < 600000),
  updated_at  timestamptz not null default now()
);

-- ---------- Classement (écrit uniquement par les fonctions serveur) ----------
create table if not exists public.ranks (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  pts         int  not null default 1000,
  wins        int  not null default 0,
  losses      int  not null default 0,
  season      text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  season_pts  int  not null default 0,
  last_match  timestamptz
);

-- ---------- Amis ----------
create table if not exists public.friends (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  friend_id   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ---------- Historique des combats PvP ----------
create table if not exists public.pvp_matches (
  id          bigint generated always as identity primary key,
  attacker    uuid not null references public.profiles(id) on delete cascade,
  defender    uuid not null references public.profiles(id) on delete cascade,
  won         boolean not null,
  delta       int not null,
  created_at  timestamptz not null default now()
);
create index if not exists pvp_matches_attacker on public.pvp_matches (attacker, created_at desc);

-- =====================================================================
-- Sécurité : Row Level Security
-- =====================================================================
alter table public.profiles    enable row level security;
alter table public.saves       enable row level security;
alter table public.ranks       enable row level security;
alter table public.friends     enable row level security;
alter table public.pvp_matches enable row level security;

drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select using (true);
drop policy if exists "créer son profil" on public.profiles;
create policy "créer son profil" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "modifier son profil" on public.profiles;
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "lire sa sauvegarde" on public.saves;
create policy "lire sa sauvegarde" on public.saves for select to authenticated using (user_id = auth.uid());
drop policy if exists "créer sa sauvegarde" on public.saves;
create policy "créer sa sauvegarde" on public.saves for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier sa sauvegarde" on public.saves;
create policy "modifier sa sauvegarde" on public.saves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Classement : lecture pour tous, aucune écriture directe (seulement via les fonctions ci-dessous)
drop policy if exists "classement lisible" on public.ranks;
create policy "classement lisible" on public.ranks for select using (true);

drop policy if exists "voir ses amis" on public.friends;
create policy "voir ses amis" on public.friends for select to authenticated using (auth.uid() in (user_id, friend_id));
drop policy if exists "demander en ami" on public.friends;
create policy "demander en ami" on public.friends for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "accepter une demande" on public.friends;
create policy "accepter une demande" on public.friends for update to authenticated using (friend_id = auth.uid()) with check (friend_id = auth.uid() and status = 'accepted');
drop policy if exists "retirer un ami" on public.friends;
create policy "retirer un ami" on public.friends for delete to authenticated using (auth.uid() in (user_id, friend_id));

drop policy if exists "voir ses combats" on public.pvp_matches;
create policy "voir ses combats" on public.pvp_matches for select to authenticated using (auth.uid() in (attacker, defender));

-- =====================================================================
-- Fonctions serveur
-- =====================================================================

-- Chaque nouveau profil reçoit sa ligne de classement
create or replace function public.on_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ranks (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists profile_rank on public.profiles;
create trigger profile_rank after insert on public.profiles for each row execute function public.on_profile_created();

-- Le serveur fixe lui-même la date de mise à jour
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves for each row execute function public.touch_updated_at();

-- Résultat d'un combat d'Arène classé : le serveur calcule les points (Elo) et applique des limites anti-abus
create or replace function public.report_pvp(p_defender uuid, p_won boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  cur    text := to_char(now() at time zone 'utc', 'YYYY-MM');
  a      public.ranks;
  d      public.ranks;
  expv   double precision;
  delta  int;
  dloss  int;
  today  int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if p_defender = me then raise exception 'Impossible de s''affronter soi-même'; end if;

  select * into a from public.ranks where user_id = me for update;
  if not found then raise exception 'Profil introuvable'; end if;
  select * into d from public.ranks where user_id = p_defender for update;
  if not found then raise exception 'Adversaire introuvable'; end if;

  if a.last_match is not null and a.last_match > now() - interval '20 seconds' then
    raise exception 'Trop rapide : attends quelques secondes entre deux combats classés';
  end if;
  select count(*) into today from public.pvp_matches where attacker = me and created_at > now() - interval '1 day';
  if today >= 60 then raise exception 'Limite de 60 combats classés par jour atteinte'; end if;

  expv  := 1.0 / (1.0 + power(10.0, (d.pts - a.pts) / 400.0));
  delta := round(32 * ((case when p_won then 1 else 0 end) - expv));
  if p_won and delta < 1 then delta := 1; end if;
  if (not p_won) and delta > -1 then delta := -1; end if;
  dloss := round(delta / 2.0);

  update public.ranks set
    pts        = greatest(0, pts + delta),
    wins       = wins + (case when p_won then 1 else 0 end),
    losses     = losses + (case when p_won then 0 else 1 end),
    season_pts = greatest(0, (case when season = cur then season_pts else 0 end) + delta),
    season     = cur,
    last_match = now()
  where user_id = me;

  update public.ranks set
    pts        = greatest(0, pts - dloss),
    season_pts = greatest(0, (case when season = cur then season_pts else 0 end) - dloss),
    season     = cur
  where user_id = p_defender;

  insert into public.pvp_matches (attacker, defender, won, delta) values (me, p_defender, p_won, delta);

  return json_build_object('delta', delta, 'pts', greatest(0, a.pts + delta));
end $$;
revoke all on function public.report_pvp(uuid, boolean) from public, anon;
grant execute on function public.report_pvp(uuid, boolean) to authenticated;
