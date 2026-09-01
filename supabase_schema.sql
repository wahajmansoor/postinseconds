-- ==============================================================================
-- POST IN SECONDS / QUOTE CANVAS - SUPABASE DATABASE SCHEMA
-- Safe to re-run in full: every statement below is idempotent.
-- ==============================================================================

-- 1. PROFILES TABLE (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

-- Helper: is the calling user an admin? SECURITY DEFINER + owned by the table
-- owner means this bypasses RLS on the internal lookup, so it can safely be
-- called from a profiles policy without re-triggering profiles' own RLS
-- (which is what caused "infinite recursion detected in policy for relation
-- profiles" when the old policies queried public.profiles from inside a
-- policy on public.profiles).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can view own profile or admins view all" on public.profiles;
create policy "Users can view own profile or admins view all"
  on public.profiles for select
  using ( auth.uid() = id or public.is_admin() );

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile."
  on public.profiles for update
  using ( auth.uid() = id );

drop policy if exists "Admins can update all profiles." on public.profiles;
create policy "Admins can update all profiles."
  on public.profiles for update
  using ( public.is_admin() );

-- Guard trigger: role can only change through the bypass flag set by
-- sanctioned SECURITY DEFINER functions (admin_update_user_role below), never
-- through a direct client UPDATE — even one that the RLS policies above would
-- otherwise allow (a user updating their own row, or an admin updating any
-- row). Without this, "Users can update own profile" alone lets any signed-in
-- user PATCH their own role to 'admin'.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if current_setting('app.bypass_profile_guard', true) <> 'on' then
    if new.role is distinct from old.role then
      raise exception 'Not authorized to change role directly';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns_trigger on public.profiles;
create trigger guard_profile_privileged_columns_trigger
  before update on public.profiles
  for each row execute procedure public.guard_profile_privileged_columns();

-- Sanctioned RPC for admins to change a user's role. Client code should call
-- this via supabase.rpc(...) instead of updating profiles.role directly.
create or replace function public.admin_update_user_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'Invalid role: %', new_role;
  end if;
  if target_id = auth.uid() then
    raise exception 'Cannot change your own role';
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set role = new_role, updated_at = now() where id = target_id;
end;
$$;

grant execute on function public.admin_update_user_role(uuid, text) to authenticated;

-- 2. TEMPLATES TABLE (Starter & Premium Templates)
create table if not exists public.templates (
  id text primary key,
  label text not null,
  category text not null default 'starter' check (category in ('starter', 'premium')),
  description text,
  state jsonb not null,
  is_premium boolean not null default false,
  is_published boolean not null default true,
  sort_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.templates enable row level security;

drop policy if exists "Published templates are viewable by everyone." on public.templates;
create policy "Published templates are viewable by everyone."
  on public.templates for select
  using ( is_published = true or auth.role() = 'authenticated' );

drop policy if exists "Only admins can modify templates." on public.templates;
create policy "Only admins can modify templates."
  on public.templates for all
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- 3. USER SAVED QUOTES (Cloud saved designs)
create table if not exists public.user_saved_quotes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'Untitled Quote',
  state jsonb not null,
  thumbnail_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_saved_quotes enable row level security;

drop policy if exists "Users can view own saved quotes." on public.user_saved_quotes;
create policy "Users can view own saved quotes."
  on public.user_saved_quotes for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can insert own saved quotes." on public.user_saved_quotes;
create policy "Users can insert own saved quotes."
  on public.user_saved_quotes for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update own saved quotes." on public.user_saved_quotes;
create policy "Users can update own saved quotes."
  on public.user_saved_quotes for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete own saved quotes." on public.user_saved_quotes;
create policy "Users can delete own saved quotes."
  on public.user_saved_quotes for delete
  using ( auth.uid() = user_id );

drop policy if exists "Admins can view all saved quotes." on public.user_saved_quotes;
create policy "Admins can view all saved quotes."
  on public.user_saved_quotes for select
  using ( public.is_admin() );

-- 3b. USER ACTIVE DRAFT (the one in-progress canvas, live-synced across a
-- user's own devices — separate from user_saved_quotes above, which is an
-- explicit "save as a named design" library the user has to act on. This
-- table instead mirrors whatever the editor currently has open, updated by
-- the app's own debounced auto-save, so opening the editor on a different
-- device (or another tab) picks up the same in-progress state, and a
-- Realtime subscription pushes further edits to any other open tab/device
-- live while both are open. One row per user (user_id IS the primary key,
-- not a separate generated id) — there is only ever one "current" draft per
-- account, so upserting on user_id is all the app needs.
create table if not exists public.user_active_draft (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  state jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_active_draft enable row level security;

drop policy if exists "Users can view own active draft." on public.user_active_draft;
create policy "Users can view own active draft."
  on public.user_active_draft for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can insert own active draft." on public.user_active_draft;
create policy "Users can insert own active draft."
  on public.user_active_draft for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update own active draft." on public.user_active_draft;
create policy "Users can update own active draft."
  on public.user_active_draft for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete own active draft." on public.user_active_draft;
create policy "Users can delete own active draft."
  on public.user_active_draft for delete
  using ( auth.uid() = user_id );

-- Adds the table to Supabase's built-in realtime publication so UPDATE/
-- INSERT events actually reach subscribed clients (postgres_changes
-- subscriptions only fire for tables in this publication). Wrapped in a
-- guard since `alter publication ... add table` errors instead of no-op-ing
-- if the table's already a member — the only way to keep this file safely
-- re-runnable in full like everything above it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_active_draft'
  ) then
    alter publication supabase_realtime add table public.user_active_draft;
  end if;
end $$;

-- 4. SYSTEM STATS TABLE
create table if not exists public.system_stats (
  id text primary key default 'global',
  total_exports integer default 0,
  total_designs_saved integer default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger to auto-create profile on new user signup. Every new signup starts
-- as a plain 'user' — there is deliberately no email-based auto-promotion
-- backdoor here. To grant admin, run a one-time UPDATE against the specific
-- person's profiles row (see the bottom of this file for the exact
-- statement); nothing in this trigger ever assigns 'admin' automatically.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '/default-img.png'),
    'user'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==============================================================================
-- ONE-TIME: grant the single admin account. Run this by itself, once, after
-- that person has already signed in at least once (their profiles row has to
-- exist first). This bypasses the guard trigger deliberately via the same
-- app.bypass_profile_guard flag admin_update_user_role() uses — it is the
-- one sanctioned place a role gets set outside that RPC, precisely because
-- the RPC itself requires an existing admin to call it and this is how the
-- very first admin gets created.
-- ==============================================================================
-- select set_config('app.bypass_profile_guard', 'on', true);
-- update public.profiles set role = 'admin' where email = 'REPLACE_WITH_THE_ONE_ADMIN_EMAIL';
