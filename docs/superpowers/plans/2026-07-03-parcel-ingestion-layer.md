# Parcel Data Ingestion Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest, normalize, and display real parcel data from authoritative public sources with permanent per-attribute provenance — no fabricated parcel data anywhere at runtime.

**Architecture:** A dedicated ingestion subsystem (`src/lib/ingestion/`) where source adapters (fetch + parse) emit raw records that a per-adapter normalizer maps into one shared `NormalizedParcel` model with per-field provenance. A pipeline persists records into Supabase (`parcels`, `ingestion_datasets`, `ingestion_runs`) and records auditable import runs. Consumers (admin dashboard, parcel inspector, future Site Qualification Engine) read only normalized records — never raw datasets.

**Tech Stack:** Next.js 16 (patched) App Router, Supabase Postgres (project `tonyville` / `kxkhhjynhavushindnaa`), ArcGIS REST FeatureServer queries, Vitest.

---

## Verified data sources (researched 2026-07-03, all checked live)

| Source | Status | Endpoint |
|---|---|---|
| LA County Parcels (Assessor / eGIS) | **live, implemented** | `https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0` — polygon geometry, AIN/APN, situs address, UseCode/UseType/UseDescription, AgencyName/Type, CENTER_LAT/LON. Verified with point query at LA City Hall (AIN 5149001915). |
| City of LA Zoning (GeoHub / City Planning) | **live, implemented** | `https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15` — `Zoning` string by polygon, data last edited 2026-07-02. Zoning enrichment for parcels with jurisdiction LOS ANGELES. |
| UCLA cityLAB | **unavailable** | Research lab (citylab.ucla.edu); publishes design research (Backyard Homes, Small Lots Big Impacts), no public parcel dataset. Registered with availability `unavailable` and honest notes — never faked. |
| California Statewide Parcels (CA State Geoportal) | **pending** | Registered as planned connector; adapter not implemented this phase. |
| LA County Unincorporated Zoning (DRP) | **pending** | Registered; zoning for unincorporated county is a later adapter. |
| Regrid / ATTOM | **not-configured** | Commercial aggregators; registered as future adapters (API keys absent). |

## Storage decision

The repo's Supabase project (`tonyville`) already holds app tables (migrations 0001–0003). No service-role key is available locally, so ingestion writes go through `SECURITY DEFINER` RPCs gated by an ingestion admin token stored in a `private` schema table (not exposed by PostgREST) and mirrored in `.env.local` as `INGESTION_ADMIN_TOKEN`. Reads use anon RLS `select` policies. If `SUPABASE_SERVICE_ROLE_KEY` is added later, the same RPC path keeps working.

## Honesty rules encoded

- Missing value → `null` in storage, "Not available from this source." in the inspector, "Data unavailable" elsewhere. Never estimated.
- Lot area is a deterministic geodesic computation from the official parcel geometry, and its provenance record says exactly that.
- Vacant/Improved is a documented derivation from the assessor's own UseDescription/building fields (contains "Vacant" → vacant; assessed building sqft or year built → improved; otherwise `null`), recorded in provenance.
- Owner type comes only from the assessor's AgencyName/AgencyType (public parcels); private parcels have no published owner in this dataset → `null`.
- Every `NormalizedParcel` carries `provenance: Record<field, {datasetId, agency, sourceUrl, retrievedAt, note?}>`.

---

### Task 1: Database schema (migration 0004)

**Files:**
- Create: `supabase/migrations/0004_parcel_ingestion.sql` (also applied to the live project via Supabase MCP `apply_migration`)

- [ ] Tables `ingestion_datasets` (registry: id, name, agency, url, coverage, availability, version, source_last_updated, notes), `ingestion_runs` (dataset_id, kind `area-import|point-lookup`, status `pending|updating|imported|failed`, timings, rows_fetched/imported/failed, errors jsonb, coverage_area, requested_by), `parcels` (normalized model + `provenance jsonb` + `raw jsonb`, unique `(source_dataset_id, source_parcel_id)`).
- [ ] RLS: enable on all three; `select` for `anon, authenticated`. No insert/update policies (writes only via definer RPCs / service role).
- [ ] `private.ingestion_secrets` + RPCs `ingestion_begin_run`, `ingestion_finish_run`, `ingestion_upsert_parcels`, `ingestion_touch_dataset` — each takes `admin_token text`, validates against `private.ingestion_secrets`, `security definer`, `set search_path = ''`.
- [ ] Seed `ingestion_datasets` with the six sources above.
- [ ] Generate a random 48-hex token; insert into `private.ingestion_secrets`; write `.env.local` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY from MCP, INGESTION_ADMIN_TOKEN) and add `INGESTION_ADMIN_TOKEN` to `.env.example`.

### Task 2: Ingestion model + geometry

**Files:**
- Create: `src/lib/ingestion/model.ts` — `NormalizedParcel`, `FieldProvenance`, `ParcelProvenance`, `DatasetDescriptor` (id, name, agency, url, coverage, availability), `IngestionRunRecord`, `AdapterFetchResult`, `ParcelSourceAdapter` interface:
  ```ts
  type ParcelSourceAdapter = {
    dataset: DatasetDescriptor;
    kind: "parcel-base" | "attribute-enrichment";
    fetchByPoint(point: {lat: number; lng: number}): Promise<AdapterFetchResult>;
    fetchByBbox(bbox: Bbox, limit: number): Promise<AdapterFetchResult>;
  };
  ```
  `AdapterFetchResult = { parcels: NormalizedParcel[]; rowsFetched: number; rowsFailed: number; errors: string[]; datasetVersion?: string; sourceLastUpdated?: string }`.
- Create: `src/lib/ingestion/geometry.ts` — `geodesicAreaSqft(ring)` (spherical excess), `bboxAround(lat, lng, radiusMiles)`, `pointInPolygon`, `centroidOfPolygon`.
- Test: `src/lib/ingestion/geometry.test.ts` — known-size square (±2%), point-in-polygon in/out cases.

### Task 3: Adapters

**Files:**
- Create: `src/lib/ingestion/adapters/arcgis.ts` — shared ArcGIS REST query helper (geojson f=geojson, point/envelope geometry params, error shape handling, layer metadata fetch for `editingInfo.dataLastEditDate` → dataset version).
- Create: `src/lib/ingestion/adapters/laCountyParcels.ts` — fetch + parse + normalize per the field mapping table (AIN→sourceParcelId/ain, APN→apn, SitusFullAddress→address, TaxRateCity→jurisdiction, SitusCity→city, UseCode→assessorUseCode, UseDescription→landUse, Agency*→ownerType, geometry→geometry+lotAreaSqft, CENTER_LAT/LON→centroid). Per-field provenance stamped with dataset id `la-county-parcels`.
- Create: `src/lib/ingestion/adapters/laCityZoning.ts` — enrichment adapter: given parcel centroids inside City of LA, point-query zoning layer, attach `zoning` + provenance `la-city-zoning`.
- Create: `src/lib/ingestion/registry.ts` — ordered adapter list + static registrations for `ucla-citylab` (unavailable), `ca-statewide-parcels` (pending), `la-county-zoning-unincorporated` (pending), `regrid` / `attom` (not-configured).
- Test: `src/lib/ingestion/adapters/laCountyParcels.test.ts` — normalize a captured real fixture feature (LA City Hall parcel): field mapping, null handling, provenance stamping, vacant/improved derivation cases.

### Task 4: Store + pipeline

**Files:**
- Create: `src/lib/ingestion/store.ts` — server-only Supabase access: `isIngestionStoreConfigured()`, `beginRun/finishRun`, `upsertParcels` (RPC with token), `getDataSourcesOverview()` (datasets + latest runs + per-dataset record counts), `findStoredParcelAtPoint(lat,lng)` (bbox prefilter on centroid + point-in-polygon on geometry), `searchStoredParcelsNear(...)`.
- Create: `src/lib/ingestion/pipeline.ts` — `runAreaImport({datasetId, center, radiusMiles, limit, requestedBy})` and `lookupParcelAtPoint({lat, lng, persist})`: fetch → normalize → zoning enrichment (City of LA parcels; per-parcel cap) → upsert → finish run with real counts/duration/errors. Never throws raw; failures recorded on the run.
- Test: `src/lib/ingestion/pipeline.test.ts` — merge of enrichment provenance; run bookkeeping with a stubbed store/adapters.

### Task 5: API routes

**Files:**
- Create: `src/app/api/admin/ingest/route.ts` — POST `{datasetId, lat, lng, radiusMiles?, limit?}`; authorized when caller is admin (profiles.role) OR `x-ingestion-token` header matches env OR dev environment; runs `runAreaImport`.
- Create: `src/app/api/admin/data-sources/route.ts` — GET overview JSON.
- Create: `src/app/api/parcels/official/route.ts` — GET `?lat&lng` → stored parcel or live point-lookup (persisted when store configured); response includes the normalized parcel + provenance + storage status. No estimation; absent fields are null.

### Task 6: /admin/data-sources dashboard

**Files:**
- Create: `src/app/admin/data-sources/page.tsx` (server component; admin-gated with dev-env bypass) — table per spec: Dataset, Agency, URL, Coverage, Version, Source Last Updated, Import Date, Status (Imported/Pending/Failed/Updating + availability for unavailable sources), Records, Last-run duration, Rows imported/failed, Errors.
- Create: `src/components/admin/IngestRunForm.tsx` (client) — trigger an area import (center lat/lng + radius + limit) against `/api/admin/ingest`, refresh on completion.

### Task 7: Parcel Inspector

**Files:**
- Create: `src/components/OfficialParcelInfo.tsx` — client section fetching `/api/parcels/official?lat&lng` for the selected parcel; renders APN, Address, Lot Area, Jurisdiction, County, Zoning, Land Use, Owner Type, Vacant/Improved, Source Dataset, Source Agency, Last Updated; every missing field renders literally "Not available from this source."
- Modify: `src/components/ParcelDetailPanel.tsx` — mount `OfficialParcelInfo` as the "Official Parcel Information" section at the top of the detail panel.

### Task 8: Remove fabricated parcel data

**Files:**
- Modify: `src/lib/providers/parcelService.ts` — delete mock fallback; empty chain → `parcels: []` with honest providerStatus/message ("Data unavailable…").
- Modify: `src/lib/parcelSearch.ts` — remove `mockParcels` import/usage.
- Modify: `src/app/api/property-fit/route.ts` — remove `mockParcelAt`; when Regrid + LA County both fail return an explicit `parcel: null` + "Data unavailable" response; adjust `PropertyFitApp` for the null case.
- Modify: `src/lib/providers/laCountyParcelProvider.ts` — stop inventing values: no `acreage * 85000` price (price 0 + priceSource "unknown"), no 7500 sqft default (geometry-derived area or exclude), keep only verifiable statements in labels.
- Delete: `src/lib/mockParcels.ts`; update tests that imported it to use inline fixtures.
- Modify: UI formatters so `priceSource === "unknown"` renders "Data unavailable" instead of $0.

### Task 9: Verification

- [ ] `npm run test`, `npm run lint`, `npm run build` all green.
- [ ] Live drive: trigger a real DTLA area import from `/admin/data-sources`; confirm run row (status Imported, rows > 0) and Supabase `parcels` rows with provenance.
- [ ] Select a parcel in find-land → Official Parcel Information shows real assessor values; a field missing from the source shows "Not available from this source."
- [ ] Grep: no `mockParcels` references anywhere in `src/`.

## Out of scope (later phases, per spec)

SB684/CABN fit/setbacks/utility/zoning-compliance/permit/feasibility/scoring engines; bulk county-wide imports; additional county adapters; removing the remaining prototype fit-score UI (flagged for Phase 3 UI pass — the score engine is slated to be replaced by the real qualification engines).
