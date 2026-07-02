-- Tonyville Supabase schema + RLS

-- profiles (created before is_admin() because the function body references it)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'buyer' check (role in ('buyer','admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- saved_searches
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location text,
  radius numeric,
  max_price numeric,
  selected_tiny_home_model integer,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.saved_searches enable row level security;
create index saved_searches_user_idx on public.saved_searches(user_id);
create policy "saved_searches_owner" on public.saved_searches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- saved_parcels
create table public.saved_parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parcel_id text not null,
  parcel_address text,
  parcel_data jsonb not null default '{}',
  score integer,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, parcel_id)
);
alter table public.saved_parcels enable row level security;
create index saved_parcels_user_idx on public.saved_parcels(user_id);
create policy "saved_parcels_owner" on public.saved_parcels for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- leads (public can insert; only admins read/update)
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  selected_parcel_id text,
  selected_model text,
  message text not null,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create policy "leads_insert_public" on public.leads for insert to anon, authenticated with check (true);
create policy "leads_select_admin" on public.leads for select using (public.is_admin());
create policy "leads_update_admin" on public.leads for update using (public.is_admin()) with check (public.is_admin());

-- tony_tiny_home_models (public reads active; admins manage)
create table public.tony_tiny_home_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  square_feet integer,
  base_price numeric,
  minimum_lot_size numeric,
  utility_requirements jsonb not null default '[]',
  description text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.tony_tiny_home_models enable row level security;
create policy "models_select_active" on public.tony_tiny_home_models for select using (active or public.is_admin());
create policy "models_admin_write" on public.tony_tiny_home_models for all
  using (public.is_admin()) with check (public.is_admin());

-- auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
