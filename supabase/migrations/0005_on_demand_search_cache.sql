-- On-demand parcel ingestion + cache (Option 1).
-- Adds parcel freshness tracking and an auditable log of customer search
-- lookups (cache hits and misses) for the Data Sources dashboard.

alter table public.parcels
  add column if not exists last_refreshed_at timestamptz not null default now();

create index if not exists parcels_last_refreshed_idx
  on public.parcels (last_refreshed_at);

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  searched_label text,
  lat double precision not null,
  lng double precision not null,
  radius_miles double precision not null,
  source_dataset_id text references public.ingestion_datasets (id),
  cache_hit boolean not null,
  parcels_found integer not null default 0,
  parcels_imported integer not null default 0,
  duration_ms integer,
  run_id uuid references public.ingestion_runs (id),
  errors jsonb not null default '[]'::jsonb,
  requested_by text,
  created_at timestamptz not null default now()
);

create index if not exists search_events_created_idx
  on public.search_events (created_at desc);

alter table public.search_events enable row level security;

create policy "search_events_public_read" on public.search_events
  for select to anon, authenticated using (true);

create or replace function public.ingestion_record_search_event(
  admin_token text,
  p_searched_label text,
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision,
  p_source_dataset_id text,
  p_cache_hit boolean,
  p_parcels_found integer,
  p_parcels_imported integer,
  p_duration_ms integer,
  p_run_id uuid,
  p_errors jsonb,
  p_requested_by text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_ingestion_token(admin_token);
  insert into public.search_events (
    searched_label, lat, lng, radius_miles, source_dataset_id, cache_hit,
    parcels_found, parcels_imported, duration_ms, run_id, errors, requested_by
  ) values (
    p_searched_label, p_lat, p_lng, p_radius_miles, p_source_dataset_id,
    p_cache_hit, p_parcels_found, p_parcels_imported, p_duration_ms, p_run_id,
    coalesce(p_errors, '[]'::jsonb), p_requested_by
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Refresh tracking: upserts now bump last_refreshed_at on every import.
create or replace function public.ingestion_upsert_parcels(
  admin_token text,
  p_parcels jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_ingestion_token(admin_token);

  insert into public.parcels (
    source_dataset_id, source_parcel_id, apn, ain, address, city, state,
    county, jurisdiction, centroid_lat, centroid_lng, geometry, lot_area_sqft,
    zoning, land_use, owner_type, improved_status, assessor_use_code,
    source_agency, source_url, dataset_version, source_last_updated,
    provenance, raw, imported_at, last_refreshed_at
  )
  select
    x.source_dataset_id, x.source_parcel_id, x.apn, x.ain, x.address, x.city,
    coalesce(x.state, 'CA'), x.county, x.jurisdiction, x.centroid_lat,
    x.centroid_lng, x.geometry, x.lot_area_sqft, x.zoning, x.land_use,
    x.owner_type, x.improved_status, x.assessor_use_code, x.source_agency,
    x.source_url, x.dataset_version, x.source_last_updated,
    coalesce(x.provenance, '{}'::jsonb), x.raw, now(), now()
  from jsonb_to_recordset(p_parcels) as x(
    source_dataset_id text, source_parcel_id text, apn text, ain text,
    address text, city text, state text, county text, jurisdiction text,
    centroid_lat double precision, centroid_lng double precision,
    geometry jsonb, lot_area_sqft double precision, zoning text,
    land_use text, owner_type text, improved_status text,
    assessor_use_code text, source_agency text, source_url text,
    dataset_version text, source_last_updated timestamptz,
    provenance jsonb, raw jsonb
  )
  on conflict (source_dataset_id, source_parcel_id) do update set
    apn = excluded.apn,
    ain = excluded.ain,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    county = excluded.county,
    jurisdiction = excluded.jurisdiction,
    centroid_lat = excluded.centroid_lat,
    centroid_lng = excluded.centroid_lng,
    geometry = excluded.geometry,
    lot_area_sqft = excluded.lot_area_sqft,
    zoning = coalesce(excluded.zoning, public.parcels.zoning),
    land_use = excluded.land_use,
    owner_type = excluded.owner_type,
    improved_status = excluded.improved_status,
    assessor_use_code = excluded.assessor_use_code,
    source_agency = excluded.source_agency,
    source_url = excluded.source_url,
    dataset_version = excluded.dataset_version,
    source_last_updated = excluded.source_last_updated,
    provenance = public.parcels.provenance || excluded.provenance,
    raw = excluded.raw,
    imported_at = now(),
    last_refreshed_at = now(),
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
