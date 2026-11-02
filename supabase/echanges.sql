-- =====================================================================
-- DRAGON CARD Z — CARTES CERTIFIÉES ET ÉCHANGES ENTRE JOUEURS
-- À exécuter dans Supabase : SQL Editor > New query > coller tout le fichier > Run.
-- Peut être relancé sans danger (après un changement de cartes par exemple).
-- Nécessite supabase/schema.sql (table profiles).
--
-- Principe : seules les fonctions ci-dessous peuvent créer ou déplacer une carte certifiée.
-- Le jeu n'a aucun droit d'écriture sur ces tables : une sauvegarde modifiée n'y change rien.
-- =====================================================================

create table if not exists public.cert_catalog(
  card_id text primary key,
  rarity  text not null check (rarity in ('c','u','r','e'))
);

create table if not exists public.certified_cards(
  id         bigint generated always as identity primary key,
  owner      uuid not null references public.profiles(id) on delete cascade,
  card_id    text not null references public.cert_catalog(card_id),
  rarity     text not null,
  created_at timestamptz not null default now()
);
create index if not exists certified_cards_owner on public.certified_cards(owner);

create table if not exists public.cert_claims(
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  primary key(user_id,day)
);

create table if not exists public.trades(
  id           bigint generated always as identity primary key,
  from_user    uuid not null references public.profiles(id) on delete cascade,
  to_user      uuid not null references public.profiles(id) on delete cascade,
  offered_id   bigint not null references public.certified_cards(id) on delete cascade,
  wanted_id    bigint not null references public.certified_cards(id) on delete cascade,
  offered_card text not null,
  wanted_card  text not null,
  status       text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired','invalid')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (from_user <> to_user)
);
create index if not exists trades_from on public.trades(from_user,status);
create index if not exists trades_to on public.trades(to_user,status);

-- Lecture seule pour le jeu ; aucune règle d'écriture : tout passe par les fonctions
alter table public.cert_catalog    enable row level security;
alter table public.certified_cards enable row level security;
alter table public.cert_claims     enable row level security;
alter table public.trades          enable row level security;

drop policy if exists cert_catalog_read on public.cert_catalog;
create policy cert_catalog_read on public.cert_catalog for select to authenticated using (true);
drop policy if exists certified_read on public.certified_cards;
create policy certified_read on public.certified_cards for select to authenticated using (true);
drop policy if exists trades_read on public.trades;
create policy trades_read on public.trades for select to authenticated using (auth.uid() = from_user or auth.uid() = to_user);

-- Âge minimum d'un compte pour échanger (ralentit les comptes créés pour alimenter un compte principal)
create or replace function public.cert_account_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from auth.users u where u.id = p_user and u.created_at <= now() - interval '3 days');
$$;
revoke all on function public.cert_account_ok(uuid) from public, anon, authenticated;

-- Booster certifié : 3 cartes tirées par le serveur, une fois par jour
create or replace function public.claim_certified_pack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_day  date := (now() at time zone 'Europe/Paris')::date;
  v_out  jsonb := '[]'::jsonb;
  v_x    float8; v_r text; v_card text; v_id bigint; i int;
begin
  if v_uid is null then return jsonb_build_object('error','not_logged_in'); end if;
  if not exists(select 1 from profiles where id = v_uid) then return jsonb_build_object('error','no_profile'); end if;
  insert into cert_claims(user_id,day) values (v_uid,v_day) on conflict do nothing;
  if not found then return jsonb_build_object('error','already_claimed'); end if;
  for i in 1..3 loop
    v_x := random()*100;
    v_r := case when v_x < 7 then 'e' when v_x < 22 then 'r' when v_x < 49 then 'u' else 'c' end;
    select card_id into v_card from cert_catalog where rarity = v_r order by random() limit 1;
    insert into certified_cards(owner,card_id,rarity) values (v_uid,v_card,v_r) returning id into v_id;
    v_out := v_out || jsonb_build_object('id',v_id,'card_id',v_card,'rarity',v_r);
  end loop;
  return jsonb_build_object('cards',v_out);
end;
$$;

-- Proposer un échange : ma carte contre une carte d'un autre joueur, de même rareté
create or replace function public.propose_trade(p_offer bigint, p_wanted bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a public.certified_cards; b public.certified_cards; v_id bigint;
begin
  if v_uid is null then return jsonb_build_object('error','not_logged_in'); end if;
  if not cert_account_ok(v_uid) then return jsonb_build_object('error','account_too_new'); end if;
  select * into a from certified_cards where id = p_offer;
  select * into b from certified_cards where id = p_wanted;
  if a.id is null or b.id is null then return jsonb_build_object('error','card_gone'); end if;
  if a.owner <> v_uid then return jsonb_build_object('error','not_your_card'); end if;
  if b.owner = v_uid then return jsonb_build_object('error','same_owner'); end if;
  if a.rarity <> b.rarity then return jsonb_build_object('error','rarity_mismatch'); end if;
  if not cert_account_ok(b.owner) then return jsonb_build_object('error','partner_too_new'); end if;
  update trades set status = 'expired', decided_at = now() where status = 'pending' and created_at < now() - interval '48 hours' and (from_user = v_uid or to_user = v_uid);
  if exists(select 1 from trades where status = 'pending' and offered_id = p_offer) then return jsonb_build_object('error','card_locked'); end if;
  if (select count(*) from trades where from_user = v_uid and status = 'pending') >= 5 then return jsonb_build_object('error','too_many_pending'); end if;
  insert into trades(from_user,to_user,offered_id,wanted_id,offered_card,wanted_card)
    values (v_uid,b.owner,a.id,b.id,a.card_id,b.card_id) returning id into v_id;
  return jsonb_build_object('id',v_id);
end;
$$;

-- Répondre à un échange : le transfert se fait d'un seul coup, après vérification
create or replace function public.respond_trade(p_id bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  t public.trades; a public.certified_cards; b public.certified_cards;
begin
  if v_uid is null then return jsonb_build_object('error','not_logged_in'); end if;
  select * into t from trades where id = p_id for update;
  if t.id is null or t.to_user <> v_uid then return jsonb_build_object('error','not_found'); end if;
  if t.status <> 'pending' then return jsonb_build_object('error','not_pending'); end if;
  if t.created_at < now() - interval '48 hours' then
    update trades set status = 'expired', decided_at = now() where id = p_id;
    return jsonb_build_object('error','expired');
  end if;
  if not p_accept then
    update trades set status = 'declined', decided_at = now() where id = p_id;
    return jsonb_build_object('ok',true);
  end if;
  if not cert_account_ok(v_uid) then return jsonb_build_object('error','account_too_new'); end if;
  -- Maximum 3 échanges par 24 h, pour chacun des deux joueurs
  if (select count(*) from trades where status = 'accepted' and decided_at > now() - interval '24 hours' and (from_user = v_uid or to_user = v_uid)) >= 3 then
    return jsonb_build_object('error','daily_limit');
  end if;
  if (select count(*) from trades where status = 'accepted' and decided_at > now() - interval '24 hours' and (from_user = t.from_user or to_user = t.from_user)) >= 3 then
    return jsonb_build_object('error','partner_limit');
  end if;
  -- Verrouille les deux cartes toujours dans le même ordre, pour éviter les blocages
  perform 1 from certified_cards where id in (t.offered_id,t.wanted_id) order by id for update;
  select * into a from certified_cards where id = t.offered_id;
  select * into b from certified_cards where id = t.wanted_id;
  if a.id is null or b.id is null or a.owner <> t.from_user or b.owner <> t.to_user then
    update trades set status = 'invalid', decided_at = now() where id = p_id;
    return jsonb_build_object('error','card_gone');
  end if;
  update certified_cards set owner = t.to_user where id = a.id;
  update certified_cards set owner = t.from_user where id = b.id;
  update trades set status = 'accepted', decided_at = now() where id = p_id;
  -- Les autres propositions portant sur ces cartes ne sont plus valables
  update trades set status = 'invalid', decided_at = now()
    where status = 'pending' and id <> p_id and (offered_id in (a.id,b.id) or wanted_id in (a.id,b.id));
  return jsonb_build_object('ok',true);
end;
$$;

-- Annuler une proposition envoyée
create or replace function public.cancel_trade(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('error','not_logged_in'); end if;
  update trades set status = 'cancelled', decided_at = now() where id = p_id and from_user = v_uid and status = 'pending';
  if not found then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.claim_certified_pack() from public, anon;
revoke all on function public.propose_trade(bigint,bigint) from public, anon;
revoke all on function public.respond_trade(bigint,boolean) from public, anon;
revoke all on function public.cancel_trade(bigint) from public, anon;
grant execute on function public.claim_certified_pack() to authenticated;
grant execute on function public.propose_trade(bigint,bigint) to authenticated;
grant execute on function public.respond_trade(bigint,boolean) to authenticated;
grant execute on function public.cancel_trade(bigint) to authenticated;

-- Cartes pouvant sortir du booster certifié (jusqu'à Épique, généré depuis le jeu)
insert into public.cert_catalog(card_id,rarity) values
  ('goku_kid','c'),
  ('krillin','c'),
  ('yamcha','c'),
  ('chaozu','c'),
  ('pilaf','c'),
  ('shu','c'),
  ('mai','c'),
  ('soldat','c'),
  ('goku_db','c'),
  ('nail','c'),
  ('saibaman','c'),
  ('guldo','c'),
  ('dodoria','c'),
  ('soldat_f','c'),
  ('spopovitch','c'),
  ('yamu','c'),
  ('videl','c'),
  ('pan','c'),
  ('giru','c'),
  ('capsule','c'),
  ('nuage','c'),
  ('nyoibo','c'),
  ('scouter','c'),
  ('armure','c'),
  ('tenshinhan','u'),
  ('blue','u'),
  ('tao','u'),
  ('c8','u'),
  ('tambourine','u'),
  ('gohan_kid','u'),
  ('dende','u'),
  ('recoome','u'),
  ('burter','u'),
  ('jeice','u'),
  ('zarbon','u'),
  ('c20','u'),
  ('c19','u'),
  ('celljr','u'),
  ('babidi','u'),
  ('goten','u'),
  ('trunks_kid','u'),
  ('satan','u'),
  ('goku_gt','u'),
  ('haze','u'),
  ('rage_s','u'),
  ('cabba','u'),
  ('caulifla','u'),
  ('gohan_ssj','u'),
  ('radar','u'),
  ('gravite','u'),
  ('db1','u'),
  ('db2','u'),
  ('db3','u'),
  ('db4','u'),
  ('db5','u'),
  ('db6','u'),
  ('db7','u'),
  ('tortue','r'),
  ('kami','r'),
  ('gohan','r'),
  ('piccolo','r'),
  ('raditz','r'),
  ('vegeta','r'),
  ('ginyu','r'),
  ('trunks','r'),
  ('c18','r'),
  ('c17','r'),
  ('cell','r'),
  ('shin','r'),
  ('uub','r'),
  ('eis','r'),
  ('kale','r'),
  ('gamma1','r'),
  ('oozaru','r'),
  ('goku_ssj1','r'),
  ('goku_ssj2','r'),
  ('vegeta_ssj','r'),
  ('trunks_ssj','r'),
  ('freezer_final','r'),
  ('cell_semi','r'),
  ('kaioken','r'),
  ('senzu','r'),
  ('salle','r'),
  ('machine','r'),
  ('daimao_p','e'),
  ('nappa','e'),
  ('freezer','e'),
  ('c16','e'),
  ('dabura','e'),
  ('buu','e'),
  ('baby','e'),
  ('nuova','e'),
  ('hit','e'),
  ('goku_black','e'),
  ('zamasu','e'),
  ('toppo','e'),
  ('goku_ssj3','e'),
  ('goku_god','e'),
  ('golden_oozaru','e'),
  ('vegeta_majin','e'),
  ('vegeta_blue','e'),
  ('gohan_ssj2','e'),
  ('piccolo_orange','e'),
  ('freezer_100','e'),
  ('buu_super','e'),
  ('baby_vegeta','e'),
  ('gotenks','e'),
  ('bazooka','c'),
  ('dogi','c'),
  ('bombe','u'),
  ('cape','u'),
  ('telecommande','u'),
  ('cuve','u'),
  ('vaisseau','u'),
  ('canon','r'),
  ('epee_z','r'),
  ('jarre','e'),
  ('fruit','e'),
  ('arene','r'),
  ('pl_namek','r'),
  ('labo','r'),
  ('vaisseau_babidi','r'),
  ('kaios','r'),
  ('pl_froid','e'),
  ('pleine_lune','e'),
  ('neant','e'),
  ('eau_divine','e')
on conflict (card_id) do update set rarity = excluded.rarity;

-- ---------------------------------------------------------------------
-- Pour toi : voir les derniers échanges
--   select t.id, a.pseudo as de, b.pseudo as vers, t.offered_card, t.wanted_card, t.status, t.created_at
--   from public.trades t join public.profiles a on a.id = t.from_user join public.profiles b on b.id = t.to_user
--   order by t.created_at desc limit 50;
-- ---------------------------------------------------------------------
