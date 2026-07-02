# ATTOM Property Intelligence Integration — Design

- **Date:** 2026-06-27
- **Status:** Approved (design); pending spec review
- **Author:** Finn Case (with Claude Code)

## Goal

Integrate ATTOM as a **secondary property-intelligence provider** while keeping Regrid
as the **primary parcel source**. The deliverable is not "another API call" but the
first concrete provider on a modular enrichment seam, so future providers (FEMA flood,
USDA soils, utility datasets, county zoning, elevation, etc.) can be added with minimal
change.

### Provider responsibilities

| Concern | Provider |
| --- | --- |
| Parcel boundaries, geometry, identification, base parcel info | **Regrid** (primary) |
| Property details, assessment, sales history, tax, building characteristics, AVM / market value, permit & market info where available | **ATTOM** (secondary, enrichment only) |

## Non-goals (YAGNI / scope guard)

- No other providers built now (FEMA/USDA/zoning/elevation). Only the seam for them.
- No Supabase wiring.
- **No change to the scoring math.** The fit-score engine (`tonyvilleFitScore.ts`) is untouched.
- ATTOM data is **display-only**; it does not feed the score.

## Key decisions (resolved during brainstorming)

1. **LandFit Score = rename only.** Rename the user-facing label "Tonyville Fit Score" →
   "LandFit Score". The scoring engine and the internal type/function names
   (`TonyvilleFitScore` / `tonyvilleFitScore`) are unchanged — only display strings change.
2. **Caching = server + client.** Server-side in-memory TTL cache (stops repeat ATTOM
   calls this process) + client-side session cache (avoids re-calling the proxy when a
   parcel is re-selected).
3. **Tests = Vitest.** Add a test runner and cover the provider layer.
4. **ATTOM lookup = defensive cascade.** Try address → APN+FIPS → lat/long against
   common ATTOM endpoints; degrade gracefully on 401/404/empty.
5. **Extensibility = enricher registry (approach A).** A single `ParcelEnricher`
   interface; `parcelService` runs a registered list of enrichers in parallel and merges
   their fragments.

## Architecture & data flow

```
Search → Regrid (primary) → parcels rendered (UNCHANGED)
User selects a parcel
  → client checks in-memory enrichment cache (keyed by parcel.id)
  → miss: POST /api/parcels/enrich  { ParcelLookup }      ← secure server route
        → parcelService.enrich(lookup)
            → server TTL cache check (keyed by parcel.id)
            → in-flight de-dup (one ATTOM call for concurrent selects)
            → miss: run registered enrichers in parallel  [ attomEnricher, …future ]
            → merge fragments → ParcelEnrichment (+ per-provider status)
        → cache + return ParcelEnrichment
  → client caches result; UI fills ATTOM-backed sections
```

- `attom.ts` and `parcelService.ts` are **server-only** (guarded with `import "server-only"`).
- The ATTOM key is read **only** inside `attom.ts` via `process.env.ATTOM_API_KEY`.
  It is never `NEXT_PUBLIC_` and never reaches the client.
- The UI never calls ATTOM directly; it only calls `/api/parcels/enrich`.
- `POST` is used (not `GET`) so Next.js does not cache it; our own cache handles dedupe,
  and the lookup payload is carried in a typed body rather than the URL.

## Files

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/regrid.ts` | unchanged | Primary parcel source. |
| `src/lib/attom.ts` | **new, server-only** | ATTOM HTTP client + field mapping; defensive lookup cascade; returns a typed fragment + `ProviderStatus`; never throws to its caller. |
| `src/lib/parcelService.ts` | **new, server-only** | `ParcelEnricher` interface, enricher registry `[attomEnricher]`, parallel orchestration, fragment merge, server TTL cache + in-flight de-dup. |
| `src/app/api/parcels/enrich/route.ts` | **new** | `POST` handler; validates `ParcelLookup` body; calls `parcelService`; returns `ParcelEnrichment`. |
| `src/lib/enrichmentClient.ts` | **new, client** | `fetchEnrichment(lookup)` + session `Map` cache; `useParcelEnrichment(parcel)` hook exposing `{ status, data }`. |
| `src/types/parcel.ts` | extended | New enrichment interfaces (below). |
| `src/components/ParcelDetailPanel.tsx` | edited | New sections, loading skeletons, graceful hiding, label rename. |
| `src/components/TonyvilleApp.tsx` | edited (light) | Pass selected-parcel enrichment into the detail panel via the hook. |

## Interfaces (TypeScript)

```ts
// Minimal identifying payload the client sends to the proxy (derived from a loaded Parcel).
type ParcelLookup = {
  id: string;
  address: string;
  city: string;
  state: string;
  county: string;
  apn?: string;     // Regrid parcelnumb / providerParcelId
  fips?: string;
  lat: number;
  lng: number;
};

interface ParcelDetails {
  propertyType?: string;
  lotSizeAcres?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  landUse?: string;
  legalDescription?: string;
  ownerOccupied?: boolean;
}

interface Assessment {
  assessedValue?: number;
  marketValue?: number;
  assessmentYear?: number;
  taxAmount?: number;
  taxYear?: number;
  taxRatePct?: number;
}

interface SaleRecord {
  date?: string;
  price?: number;
  buyer?: string;
  seller?: string;
  docType?: string;
}
type SalesHistory = SaleRecord[];

// Richer than base Parcel.utilities (Record<UtilityKey, boolean>); source-aware.
interface Utilities {
  water?: boolean;
  electricity?: boolean;
  sewerSeptic?: boolean;
  gas?: boolean;
  source: "regrid" | "attom" | "inferred";
}

interface PropertyFeatures {
  beds?: number;
  baths?: number;
  buildingSqft?: number;
  stories?: number;
  construction?: string;
  roof?: string;
  heating?: string;
  cooling?: string;
  garage?: string;
}

interface ProviderStatus {
  name: string;                                   // "attom"
  status: "ready" | "empty" | "missing-key" | "error";
  message: string;
}

interface ParcelEnrichment {
  parcelId: string;
  details?: ParcelDetails;
  assessment?: Assessment;
  salesHistory?: SalesHistory;
  propertyFeatures?: PropertyFeatures;
  utilities?: Utilities;
  estimatedValue?: number;          // ATTOM AVM if present
  providers: ProviderStatus[];      // attribution + per-source health
}
```

**Every enrichment field is optional** — that optionality is the mechanism for graceful
section hiding. Adding FEMA later adds e.g. `floodRisk?: FloodRisk` to `ParcelEnrichment`
and a `femaEnricher` to the registry — no route, client, or ATTOM changes.

### Enricher seam

```ts
type EnrichmentFragment =
  Partial<Pick<ParcelEnrichment,
    "details" | "assessment" | "salesHistory" | "propertyFeatures" | "utilities" | "estimatedValue"
  >> & { status: ProviderStatus };

interface ParcelEnricher {
  name: string;
  enrich(lookup: ParcelLookup): Promise<EnrichmentFragment>;
}

const enrichers: ParcelEnricher[] = [attomEnricher]; // future: femaEnricher, usdaEnricher, …
```

`parcelService.enrich` runs all enrichers with `Promise.allSettled`, merges fragments into
one `ParcelEnrichment`, collects each `ProviderStatus`, and never lets one failing provider
break the others.

## Detail-panel sections

Each ATTOM-backed section shows a **skeleton while `status === "loading"`**, then renders
only if its data exists — otherwise it is omitted entirely (no empty boxes, no errors).

| Section | Source | Hide when |
| --- | --- | --- |
| Property Overview | `details` + base parcel | never (base parcel always present) |
| Lot Size | base acreage, enriched by `details.lotSize*` | never |
| Estimated Value | `estimatedValue` | absent |
| Assessed Value | `assessment.assessedValue/marketValue` | absent |
| Property Taxes | `assessment.taxAmount/taxYear` | absent |
| Previous Sale History | `salesHistory` | empty |
| Building Information | `propertyFeatures` | vacant land / none ("if applicable") |
| ATTOM Property Data | key ATTOM fields + "Data via ATTOM" attribution | ATTOM `empty`/`error` |
| Tonyville Build Compatibility | existing `compatibility` (section renamed, logic unchanged) | never |
| LandFit Score | existing fit score; **label** renamed (ScoreDial + breakdown) | never |

The panel's **existing Utilities section** stays and is upgraded: when `enrichment.utilities`
is present it displays the source-aware ATTOM data; otherwise it falls back to the base
`parcel.utilities`. (This is why `Utilities` is its own interface but not a separate new
section.)

## Error handling & caching

- **Graceful degradation:** ATTOM 401/404/timeout/empty → that provider's fragment is
  `undefined` with a `ProviderStatus` of `error`/`empty`/`missing-key`. The parcel and all
  Regrid/heuristic data still render fully. ATTOM is never on the critical path.
- **Server cache:** module-level `Map<parcelId, { value; expires }>` with a TTL (default
  24h, env-tunable via e.g. `ATTOM_CACHE_TTL_MS`). In-flight de-dup so concurrent selects
  of the same parcel trigger a single ATTOM call. Resets on redeploy (acceptable — no DB).
- **Client cache:** session `Map<parcelId, ParcelEnrichment>` so re-selecting a parcel does
  not re-hit the proxy. Client enrichment status: `idle | loading | ready | error`.

## Security

- ATTOM key server-only; never bundled to the client.
- The `POST /api/parcels/enrich` body is validated (required fields, finite lat/lng, length
  caps) before any ATTOM call. The ATTOM host is fixed; no user-controlled URLs (no SSRF).
- Rendered ATTOM strings go through React's auto-escaping (no `dangerouslySetInnerHTML`).

## Testing (Vitest)

Add Vitest + scripts (`npm test`, `npm run test:watch`). With `fetch` mocked:

- `attom.ts`: raw ATTOM JSON → typed fragment mapping; the lookup cascade
  (address → APN+FIPS → lat/long); 401/empty → graceful `ProviderStatus`.
- `parcelService.ts`: merge of multiple fragments; cache hit/miss + TTL expiry; in-flight
  de-dup; one failing enricher does not break others.

## Open items for implementation

- Confirm exact ATTOM endpoint paths/params against the live key during implementation
  (the cascade is designed to tolerate the wrong package via graceful 401/404 handling).
- Add the `server-only` package if not already available (used to guard server modules).
