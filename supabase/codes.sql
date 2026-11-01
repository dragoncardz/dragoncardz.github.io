-- =====================================================================
-- DRAGON CARD Z — CODES CADEAUX
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Les codes ne sont jamais stockés en clair : seulement leur empreinte (SHA-256).
-- Personne ne peut lire ces tables depuis le jeu : seule la fonction redeem_code y accède.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.gift_codes(
  code_hash  text primary key,                 -- sha256 du code en MAJUSCULES, en hexadécimal
  reward     jsonb not null,                   -- ex. {"z":1000,"tk":2,"orbe":20,"parch":1,"cards":["broly"],"pack":"z","msg":"Merci !"}
  max_uses   int  not null default 1,          -- 0 = illimité (un seul usage par compte dans tous les cas)
  uses       int  not null default 0,
  expires_at timestamptz,                      -- null = n'expire pas
  note       text,                             -- pour toi : à quoi sert ce code
  created_at timestamptz not null default now()
);
create table if not exists public.gift_redemptions(
  code_hash   text not null references public.gift_codes(code_hash) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key(code_hash,user_id)
);
create table if not exists public.gift_attempts(
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists gift_attempts_user_at on public.gift_attempts(user_id,at);

-- RLS activé sans aucune règle : ces tables sont invisibles depuis l'API
alter table public.gift_codes       enable row level security;
alter table public.gift_redemptions enable row level security;
alter table public.gift_attempts    enable row level security;

create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
  v_gift public.gift_codes;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;

  -- 20 codes faux maximum par heure et par compte
  if (select count(*) from public.gift_attempts where user_id = v_uid and at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many';
  end if;

  v_hash := encode(extensions.digest(convert_to(upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g')), 'UTF8'), 'sha256'), 'hex');

  select * into v_gift from public.gift_codes where code_hash = v_hash for update;
  if not found then
    insert into public.gift_attempts(user_id) values (v_uid);
    raise exception 'invalid_code';
  end if;
  if v_gift.expires_at is not null and v_gift.expires_at < now() then raise exception 'expired'; end if;
  if exists(select 1 from public.gift_redemptions where code_hash = v_hash and user_id = v_uid) then raise exception 'already_used'; end if;
  if v_gift.max_uses > 0 and v_gift.uses >= v_gift.max_uses then raise exception 'exhausted'; end if;

  insert into public.gift_redemptions(code_hash, user_id) values (v_hash, v_uid);
  update public.gift_codes set uses = uses + 1 where code_hash = v_hash;
  return v_gift.reward;
end;
$$;

revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- Créer un nouveau code plus tard (remplace MONCODE et la récompense) :
--
-- insert into public.gift_codes(code_hash, reward, max_uses, note) values (
--   encode(extensions.digest(convert_to('MONCODE','UTF8'),'sha256'),'hex'),
--   '{"z":500,"tk":1,"msg":"Bon jeu !"}', 1, 'Code pour ...');
--
-- Voir qui a utilisé quoi :
--   select note, uses, max_uses, expires_at from public.gift_codes order by created_at;
-- Désactiver un code : update public.gift_codes set max_uses = uses where note = '...';
-- ---------------------------------------------------------------------
