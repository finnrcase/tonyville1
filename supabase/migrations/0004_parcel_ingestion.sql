-- Phase 2: Parcel Data Ingestion Layer
-- Normalized parcel store + dataset registry + auditable import runs.
-- Writes go through SECURITY DEFINER RPCs gated by a token held in the
-- `private` schema (not exposed over PostgREST); reads are public SELECT.

create table if not exists public.ingestion_datasets (
  id text primary key,
  name text not null,
  agency text not null,
  url text,
  coverage text,
  availability text not null default 'live'
    check (availability in ('live', 'pending', 'unavailable', 'not-configured')),
  version text,
  source_last_updated timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id text not null references public.ingestion_datasets (id),
  kind text not null check (kind in ('area-import', 'point-lookup')),
  status text not null default 'pending'
    check (status in ('pending', 'updating', 'imported', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  rows_fetched integer not null default 0,
  rows_imported integer not null default 0,
  rows_failed integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  coverage_area text,
  requested_by text
);

create index if not exists ingestion_runs_dataset_started_idx
  on public.ingestion_runs (dataset_id, started_at desc);

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  source_dataset_id text not null references public.ingestion_datasets (id),
  source_parcel_id text not null,
  apn text,
  ain text,
  address text,
  city text,
  state text not null default 'CA',
  county text,
  jurisdiction text,
  centroid_lat double precision,
  centroid_lng double precision,
  geometry jsonb,
  lot_area_sqft double precision,
  zoning text,
  land_use text,
  owner_type text,
  improved_status text check (improved_status in ('improved', 'vacant')),
  assessor_use_code text,
  source_agency text,
  source_url text,
  dataset_version text,
  source_last_updated timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  raw jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_dataset_id, source_parcel_id)
);

create index if not exists parcels_centroid_idx
  on public.parcels (centroid_lat, centroid_lng);
create index if not exists parcels_ain_idx on public.parcels (ain);

alter table public.ingestion_datasets enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.parcels enable row level security;

create policy "ingestion_datasets_public_read" on public.ingestion_datasets
  for select to anon, authenticated using (true);
create policy "ingestion_runs_public_read" on public.ingestion_runs
  for select to anon, authenticated using (true);
create policy "parcels_public_read" on public.parcels
  for select to anon, authenticated using (true);

-- Private token storage: the `private` schema is not exposed by PostgREST.
create schema if not exists private;

create table if not exists private.ingestion_secrets (
  k text primary key,
  v text not null
);

create or replace function private.assert_ingestion_token(admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if admin_token is null
    or not exists (
      select 1 from private.ingestion_secrets
      where k = 'admin_token' and v = admin_token
    )
  then
    raise exception 'invalid ingestion admin token';
  end if;
end;
$$;

create or replace function public.ingestion_begin_run(
  admin_token text,
  p_dataset_id text,
  p_kind text,
  p_coverage text,
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
  insert into public.ingestion_runs (dataset_id, kind, status, coverage_area, requested_by)
  values (p_dataset_id, p_kind, 'updating', p_coverage, p_requested_by)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ingestion_finish_run(
  admin_token text,
  p_run_id uuid,
  p_status text,
  p_rows_fetched integer,
  p_rows_imported integer,
  p_rows_failed integer,
  p_errors jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_ingestion_token(admin_token);
  update public.ingestion_runs
  set status = p_status,
      finished_at = now(),
      duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer,
      rows_fetched = coalesce(p_rows_fetched, rows_fetched),
      rows_imported = coalesce(p_rows_imported, rows_imported),
      rows_failed = coalesce(p_rows_failed, rows_failed),
      errors = coalesce(p_errors, errors)
  where id = p_run_id;
end;
$$;

create or replace function public.ingestion_touch_dataset(
  admin_token text,
  p_dataset_id text,
  p_version text,
  p_source_last_updated timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_ingestion_token(admin_token);
  update public.ingestion_datasets
  set version = coalesce(p_version, version),
      source_last_updated = coalesce(p_source_last_updated, source_last_updated),
      updated_at = now()
  where id = p_dataset_id;
end;
$$;

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
    provenance, raw, imported_at
  )
  select
    x.source_dataset_id, x.source_parcel_id, x.apn, x.ain, x.address, x.city,
    coalesce(x.state, 'CA'), x.county, x.jurisdiction, x.centroid_lat,
    x.centroid_lng, x.geometry, x.lot_area_sqft, x.zoning, x.land_use,
    x.owner_type, x.improved_status, x.assessor_use_code, x.source_agency,
    x.source_url, x.dataset_version, x.source_last_updated,
    coalesce(x.provenance, '{}'::jsonb), x.raw, now()
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
    -- An import that could not re-fetch zoning must not erase zoning that an
    -- earlier enrichment recorded; provenance merges so both sources persist.
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
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Dataset registry seeds. Availability is honest: sources without a public
-- dataset are recorded as such, never faked.
insert into public.ingestion_datasets (id, name, agency, url, coverage, availability, notes)
values
  (
    'la-county-parcels',
    'LA County Parcels (Assessor Parcel Boundaries)',
    'County of Los Angeles — eGIS / Office of the Assessor',
    'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0',
    'Los Angeles County, CA (~2.4M parcels)',
    'live',
    'Authoritative parcel boundaries, situs address, and assessor use codes. Queried on demand by point or bounding box.'
  ),
  (
    'la-city-zoning',
    'Zoning (City of Los Angeles)',
    'City of Los Angeles — Department of City Planning (GeoHub)',
    'https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15',
    'City of Los Angeles',
    'live',
    'Official zoning polygons. Used to enrich parcels whose jurisdiction is the City of Los Angeles.'
  ),
  (
    'ucla-citylab',
    'UCLA cityLAB',
    'cityLAB — UCLA Architecture and Urban Design',
    'https://www.citylab.ucla.edu/',
    'Los Angeles research studies',
    'unavailable',
    'cityLAB publishes design research (Backyard Homes; Small Lots, Big Impacts) but no public parcel dataset as of 2026-07-03. Recorded honestly as unavailable; re-evaluate if a dataset is released.'
  ),
  (
    'ca-statewide-parcels',
    'California Statewide Parcels',
    'State of California — CA State Geoportal',
    'https://gis.data.ca.gov/',
    'California (statewide)',
    'pending',
    'Planned connector for statewide coverage beyond Los Angeles County.'
  ),
  (
    'la-county-zoning-unincorporated',
    'Zoning (LA County Unincorporated Areas)',
    'LA County Department of Regional Planning',
    'https://planning.lacounty.gov/maps-and-gis/gis-data/',
    'Unincorporated Los Angeles County',
    'pending',
    'Planned zoning enrichment for parcels outside incorporated cities.'
  ),
  (
    'regrid',
    'Regrid Parcel API',
    'Regrid (commercial aggregator)',
    'https://regrid.com/',
    'United States',
    'not-configured',
    'Commercial aggregator of county parcel records. Future adapter; requires REGRID_API_KEY.'
  ),
  (
    'attom',
    'ATTOM Property API',
    'ATTOM Data Solutions (commercial)',
    'https://www.attomdata.com/',
    'United States',
    'not-configured',
    'Commercial property data. Future adapter; requires ATTOM_API_KEY.'
  )
on conflict (id) do nothing;
