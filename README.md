# Tonyville

Tonyville is a premium land-search MVP for buyers of Tony's tiny homes. It helps shoppers find small parcels that are plausible candidates for tiny-home placement, then ranks each lot with a Tonyville Fit Score based on price, acreage, utilities, road access, zoning risk, distance, and terrain assumptions.

The current app is intentionally focused on search, map exploration, parcel ranking, property intelligence, and a polished real-estate browsing experience. Supabase-backed auth/saves/leads have initial wiring, with graceful local or sign-in states where production tables or sessions are not available.

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Mapbox GL
- Regrid parcel provider module
- ATTOM property intelligence provider
- Supabase auth/data modules
- Mock parcel fallback

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

Build for production:

```bash
npm run build
```

## Environment Variables

Required for the live map:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=
```

Optional for live parcel lookup. Without it, Tonyville uses visibly labeled mock parcel data:

```bash
REGRID_API_KEY=
```

Optional for selected-parcel enrichment. Keep this server-only:

```bash
ATTOM_API_KEY=
```

Supabase auth, saved searches/properties, and leads:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit real environment files. `.env`, `.env.local`, and other `.env*` files are ignored. `.env.example` is safe to commit because it only contains placeholders.

## Current MVP Features

- Map-first premium real-estate search interface
- Typed location search through Mapbox geocoding
- Debounced search/filter updates
- URL search-state persistence for shareable searches
- Search while moving the map
- Streets/satellite map toggle
- Current-location search button
- Clustered map markers and selected parcel highlighting
- Responsive desktop side panel and mobile results drawer
- Parcel cards with price, acres, distance, utilities, compatibility, preview image, and Tonyville Score
- Parcel detail panel with overview, compatibility, utilities, access, site work, permit difficulty, nearby amenities, recommended Tony models, recommendation, and score breakdown
- ATTOM enrichment sections for assessment, taxes, sales, building details, and provider availability
- Ask Tony mailto CTA with parcel/model/share-link context
- Tiny-home match panel with best model recommendation
- Saved-property CTA with Supabase or sign-in/local fallback state
- Sort by best match, lowest price, largest lot, closest, or highest score
- Regrid provider module with mock fallback
- Modular Tonyville Fit Score engine

## Project Structure

- `src/app/api/parcels/route.ts` - API route for parcel search and provider fallback
- `src/app/api/geocode/route.ts` - server-side Mapbox geocoding
- `src/app/api/parcels/enrich/route.ts` - server-side parcel enrichment
- `src/lib/regrid.ts` - Regrid provider adapter
- `src/lib/attom.ts` - ATTOM provider adapter
- `src/lib/parcelService.ts` - enrichment orchestration between providers
- `src/lib/contactTony.ts` - Tony contact mailto builder
- `src/lib/mockParcels.ts` - local fallback parcel data
- `src/lib/parcelSearch.ts` - filtering, sorting, and search-center helpers
- `src/lib/tonyvilleFitScore.ts` - weighted scoring engine
- `src/lib/tinyHomes.ts` - Tony tiny-home model definitions and compatibility logic
- `src/lib/searchState.ts` - URL state parsing and serialization
- `src/components/MapView.tsx` - Mapbox rendering and map interactions
- `src/components/SearchFilters.tsx` - search and filter controls
- `src/components/ParcelList.tsx` - ranked results cards
- `src/components/ParcelDetailPanel.tsx` - selected parcel recommendation panel
- `src/lib/data/*` and `src/lib/supabase/*` - Supabase-backed auth/data modules
- `src/lib/future/*` - placeholders for future integrations

## Supabase Setup

Supabase modules are present for:

- saved searches
- saved properties
- leads/contact Tony
- user profiles
- Tony tiny-home model catalog sync
- authentication/session plumbing

Expected Supabase tables:

- `profiles`
- `saved_searches`
- `saved_properties`
- `leads`
- `tiny_home_models`
- `parcel_notes`

## Future APIs and Integrations

- Regrid enrichment beyond point/radius lookup
- AI parcel recommendations
- Cost estimator and site-prep estimates
- Financing scenarios
- Lead routing/contact Tony workflow
- Saved searches and saved parcel alerts
- Parcel imagery, flood/plain, slope, soil, and utility overlays
