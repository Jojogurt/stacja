-- 0003_teams_and_friends.sql
-- MVP-1 drużyn i znajomych (anon-auth identity = profiles.id = auth.uid).
-- Zaaplikowane na projekt stacja (agkarxtjcgklepefurza) przez Supabase MCP:
--   migracje: teams_and_friends_mvp1 + teams_friends_harden.
-- Dostęp WYŁĄCZNIE przez funkcje RPC (SECURITY DEFINER) — tabele mają RLS bez
-- polityk permisywnych, więc bezpośredni dostęp z klienta jest zablokowany.

-- profile: kod znajomego + emoji
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists emoji text;

create or replace function public.gen_short_code() returns text
  language sql volatile set search_path=public as $$
  select upper(substr(md5(gen_random_uuid()::text),1,6));
$$;

update public.profiles set friend_code = public.gen_short_code() where friend_code is null;
create unique index if not exists profiles_friend_code_key on public.profiles(friend_code);

create or replace function public.set_friend_code() returns trigger
  language plpgsql set search_path=public as $$
begin
  if new.friend_code is null then new.friend_code := public.gen_short_code(); end if;
  return new;
end $$;
drop trigger if exists trg_set_friend_code on public.profiles;
create trigger trg_set_friend_code before insert on public.profiles
  for each row execute function public.set_friend_code();

-- tabele
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Drużyna',
  emoji text not null default '🍺',
  code text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create table if not exists public.friend_requests (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.friend_requests enable row level security;

-- RPC: drużyny
create or replace function public.app_create_group(p_name text, p_emoji text)
returns public.groups language plpgsql security definer set search_path=public as $$
declare g public.groups; c text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  loop c := public.gen_short_code(); exit when not exists(select 1 from public.groups where code=c); end loop;
  insert into public.groups(name,emoji,code,owner_id)
    values (coalesce(nullif(trim(p_name),''),'Drużyna'), coalesce(nullif(trim(p_emoji),''),'🍺'), c, uid)
    returning * into g;
  insert into public.group_members(group_id,profile_id,role) values (g.id, uid, 'owner');
  return g;
end $$;

create or replace function public.app_join_group(p_code text)
returns public.groups language plpgsql security definer set search_path=public as $$
declare g public.groups; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into g from public.groups where code = upper(trim(p_code));
  if g.id is null then raise exception 'group_not_found'; end if;
  insert into public.group_members(group_id,profile_id) values (g.id, uid) on conflict do nothing;
  return g;
end $$;

create or replace function public.app_leave_group(p_group uuid)
returns void language plpgsql security definer set search_path=public as $$
begin delete from public.group_members where group_id=p_group and profile_id=auth.uid(); end $$;

create or replace function public.app_my_groups()
returns table(id uuid, name text, emoji text, code text, owner_id uuid, members int)
language sql security definer set search_path=public stable as $$
  select g.id, g.name, g.emoji, g.code, g.owner_id,
    (select count(*)::int from public.group_members m2 where m2.group_id=g.id)
  from public.groups g join public.group_members m on m.group_id=g.id and m.profile_id=auth.uid()
  order by g.created_at;
$$;

create or replace function public.app_group_members(p_group uuid)
returns table(profile_id uuid, handle text, emoji text, role text)
language sql security definer set search_path=public stable as $$
  select p.id, p.handle, p.emoji, m.role
  from public.group_members m join public.profiles p on p.id=m.profile_id
  where m.group_id=p_group and exists(select 1 from public.group_members me where me.group_id=p_group and me.profile_id=auth.uid())
  order by (m.role='owner') desc, m.joined_at;
$$;

-- RPC: znajomi
create or replace function public.app_add_friend(p_code text)
returns public.friend_requests language plpgsql security definer set search_path=public as $$
declare target uuid; uid uuid := auth.uid(); fr public.friend_requests;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select id into target from public.profiles where friend_code = upper(trim(p_code));
  if target is null then raise exception 'profile_not_found'; end if;
  if target = uid then raise exception 'self'; end if;
  update public.friend_requests set status='accepted'
    where from_id=target and to_id=uid and status='pending' returning * into fr;
  if fr.id is not null then return fr; end if;
  insert into public.friend_requests(from_id,to_id) values (uid,target)
    on conflict (from_id,to_id) do update
      set status = case when friend_requests.status='declined' then 'pending' else friend_requests.status end
    returning * into fr;
  return fr;
end $$;

create or replace function public.app_respond_friend(p_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.friend_requests set status = case when p_accept then 'accepted' else 'declined' end
  where id=p_id and to_id=auth.uid() and status='pending';
end $$;

create or replace function public.app_friends()
returns table(profile_id uuid, handle text, emoji text, friend_code text)
language sql security definer set search_path=public stable as $$
  select p.id, p.handle, p.emoji, p.friend_code from public.friend_requests f
  join public.profiles p on p.id = case when f.from_id=auth.uid() then f.to_id else f.from_id end
  where f.status='accepted' and (f.from_id=auth.uid() or f.to_id=auth.uid()) order by p.handle;
$$;

create or replace function public.app_pending_friends()
returns table(req_id bigint, profile_id uuid, handle text, emoji text)
language sql security definer set search_path=public stable as $$
  select f.id, p.id, p.handle, p.emoji from public.friend_requests f
  join public.profiles p on p.id=f.from_id where f.to_id=auth.uid() and f.status='pending'
  order by f.created_at desc;
$$;

create or replace function public.app_me()
returns table(id uuid, handle text, emoji text, friend_code text)
language sql security definer set search_path=public stable as $$
  select id, handle, emoji, friend_code from public.profiles where id=auth.uid();
$$;

-- uprawnienia: tylko zalogowani (anon-auth ma rolę authenticated); odebrane od anon/public
grant execute on function
  public.app_create_group(text,text), public.app_join_group(text), public.app_leave_group(uuid),
  public.app_my_groups(), public.app_group_members(uuid),
  public.app_add_friend(text), public.app_respond_friend(bigint,boolean),
  public.app_friends(), public.app_pending_friends(), public.app_me()
to authenticated;
revoke execute on function
  public.app_create_group(text,text), public.app_join_group(text), public.app_leave_group(uuid),
  public.app_my_groups(), public.app_group_members(uuid),
  public.app_add_friend(text), public.app_respond_friend(bigint,boolean),
  public.app_friends(), public.app_pending_friends(), public.app_me()
from anon, public;
