# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: this is a modified Next.js

This repo pins `next@16.2.9`, but the framework has been patched with breaking changes that differ from public Next.js docs and your training data. **Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`** (organized as `01-app/`, `02-pages/`, `03-architecture/`). These docs also embed inline `{/* AI agent hint: ... */}` comments pointing at non-obvious behavior (e.g. instant-navigation requires exporting `unstable_instant` from a route) — heed them and any deprecation notices.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build
npm start        # serve production build
npm run lint     # eslint (flat config, eslint-config-next)
npm run test     # vitest unit tests
```

Local env: `cp .env.example .env.local`. With no `NEXT_PUBLIC_MAPBOX_TOKEN` the live map and geocoding routes show explicit fallback/error states; with no `REGRID_API_KEY` the UI labels the mock parcel fallback. `ATTOM_API_KEY` is server-only and used through `/api/parcels/enrich`. Supabase browser env vars enable auth-backed saved searches/properties; without a signed-in user, saves show a sign-in state instead of failing silently.

## Architecture

Tonyville is a single-page, map-first land search for tiny-home buyers. The main app route is `/`; API routes include parcel search, geocoding, enrichment, saved searches/properties, auth, and lead/contact flows. The search experience is driven by **search state** that round-trips through the URL.

### Search state is the single source of truth

`SearchFilters` + sort + map style + map-search-center serialize to URL query params and back via [src/lib/searchState.ts](src/lib/searchState.ts) (`parseSearchState` / `createSearchParams`). This same parser runs in **two places**, so keep them consistent:

- **Server**: [src/app/page.tsx](src/app/page.tsx) parses `searchParams` to seed the initial render (shareable/bookmarkable searches).
- **API route**: [src/app/api/parcels/route.ts](src/app/api/parcels/route.ts) parses the same params to run the search.
- **Geocoding**: [src/app/api/geocode/route.ts](src/app/api/geocode/route.ts) resolves typed locations through Mapbox on the server, then updates the URL with lat/lng/area.

[src/components/TonyvilleApp.tsx](src/components/TonyvilleApp.tsx) (`"use client"`) holds all live state, debounces filter/map changes (350ms), pushes them into the URL via `history.replaceState`, and re-fetches `/api/parcels` on every debounced change (with `AbortController` to cancel in-flight requests). It renders mock results immediately on mount, then swaps in the fetched results.

### Parcel data pipeline

```
Regrid parcel search → scoreAndFilterParcels() → sortParcels() [client]
Selected parcel → parcelService → ATTOM enrichment
```

- [src/lib/regrid.ts](src/lib/regrid.ts) — adapter for the Regrid `parcels/point` API. Maps loosely-typed Regrid fields to the `Parcel` shape and infers permit/zoning. Returns a `status` (`missing-key`/`empty`/`error`/`ready`).
- **Fallback chain** (in the API route): try Regrid → if it yields scored matches use them (`source: "regrid"`); otherwise fall back to [src/lib/mockParcels.ts](src/lib/mockParcels.ts) (`source: "mock"` when Regrid was unavailable, `source: "fallback"` when Regrid returned data but nothing survived filtering). The `providerStatus`/`providerMessage` surface this to the UI.
- [src/lib/parcelService.ts](src/lib/parcelService.ts) and [src/lib/attom.ts](src/lib/attom.ts) — server-side enrichment path for selected parcels. ATTOM failures are cached/session-safe on the client and shown as unavailable data, not fatal UI errors.
- [src/lib/parcelSearch.ts](src/lib/parcelSearch.ts) — `scoreAndFilterParcels` computes distance, fit score, and tiny-home compatibility per parcel, then filters by radius/price/utilities/road/permit. `sortParcels` is applied separately on the client so re-sorting doesn't refetch.

### Tonyville Fit Score engine

[src/lib/tonyvilleFitScore.ts](src/lib/tonyvilleFitScore.ts) is **data-driven**: `TONYVILLE_SCORE_CRITERIA` is an array of weighted criteria (price, lotSize, utilities, roadAccess, zoning, distance, terrain), each with a 0–100 `score(context)` fn. The total is a weight-normalized average. To change scoring, edit/add criteria in that array — `buildBreakdown` and the total iterate over it automatically. `FitScoreBreakdown` keys must stay in sync with the criteria `key`s.

### Types

[src/types/parcel.ts](src/types/parcel.ts) is the shared contract for everything above (`Parcel`, `ScoredParcel`, `SearchFilters`, `ParcelSearchResponse`, etc.). `ScoredParcel = Parcel & { distanceMiles, fitScore, compatibility }` is what the UI consumes.

### Future integration placeholders

Supabase auth, saved searches/properties, user profiles, and leads have initial app wiring. `src/lib/future/*` still contains placeholders for financing, cost estimator, AI recommendations, and site-prep estimates.

## Conventions

- Import alias `@/*` → `./src/*`.
- Styling is Tailwind v4 (`@import "tailwindcss"` in [src/app/globals.css](src/app/globals.css), theme tokens via `@theme inline`). UI is a glassmorphism design with hardcoded hex colors; icons from `lucide-react`.
- The `/api/parcels` route is `export const dynamic = "force-dynamic"` (no caching of the search itself); the Regrid fetch uses `next: { revalidate: 300 }`.
