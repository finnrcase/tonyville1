# CABN Configurator — Product Direction Design

- **Date:** 2026-06-28
- **Status:** Approved (design); Phase 1 to implement
- **Branch:** `cabn-configurator`

## Vision

Buying a CABN should feel like configuring a car on a manufacturer site: choose a model,
decide whether you own land or need to find it, see whether the CABN realistically fits, and
get a clear next step. Guided and card-based (Tesla configurator / Apple checkout / Zillow
map / Airbnb cards) — not a GIS dashboard.

## What already exists (build on, don't rebuild)

- `CABN_MODELS` (in `src/lib/scoring/cabnCompatibilityScore.ts`) already carries footprint
  geometry: `id`, `name`, `sizeSqft`, `widthFt`, `lengthFt`, `footprintSqft`,
  `maximumSlopePct`, `foundation` (ids: `cabn-120/140/160/200/480`).
- Geocoding (`/api/geocode`), parcel boundaries (Regrid + LA county GIS), Mapbox, and the
  full **CABN Compatibility / LandFit** scoring + provider stack (USGS topography, FEMA
  flood, CAL FIRE, ATTOM, utilities, regulatory) all exist. **Flow B is ~80% built.**
- `TonyvilleApp` is the current map-search experience; it becomes **Flow B**.

## Key decisions

1. **Deliverable:** committed design (this doc) → implement **Phase 1** now.
2. **Placement tech (Flow A):** Mapbox GL + **Turf.js** — draggable/rotatable GeoJSON
   footprint with geo-accurate validation (`@turf/turf` dependency, Phase 2).
3. **Structures/setbacks (Flow A):** user manually marks existing structures (use a GIS
   building-footprint source like LA county when available); apply a **default assumed
   setback** (5 ft) clearly labeled "needs county confirmation."

## Product structure

`/` becomes **`BuildPlanWizard`**, a client step machine with state persisted to the URL
(`?path=own&model=cabn-120`) so plans are shareable and Flow B keeps its existing
search-state params.

- **Step 1 — Path:** "I already have a property" (Flow A) · "Help me find land" (Flow B).
- **Step 2 — Model:** configurator cards from `CABN_MODELS`: name, `widthFt×lengthFt`
  footprint, sqft, **price (placeholder)**, minimum clearance/setback default, foundation,
  utility needs.
- **Step 3A (own):** address input → parcel map → draggable placement simulator (Flow A).
- **Step 3B (find):** location/budget/radius filters → parcel search/ranking (Flow B), with
  the chosen model pre-applied (`model.sizeSqft → filters.modelSize`).

Step 3 swaps content in place (configurator feel; no full reload). A persistent "your CABN"
summary (model + path) and a single primary CTA per step.

## Data model

- `CABNModel` (exists) — single source of truth for both flows; surfaced via a new
  `src/lib/cabnModels.ts` (re-exports `CABN_MODELS` + `getCabnModel(id)`), imported by the
  configurator, YardFit, and LandFit so models never diverge.
- `BuildPlan = { path: "own" | "find"; modelId: string }` — wizard state, URL-encoded.
- Flow A output: `YardFitResult` (new). Flow B output: existing
  `ScoredParcel.cabnCompatibility`.
- Persistence of saved plans is deferred to Phase 3 (the `saved_*` Supabase tables exist).

## Scoring systems (two, same models)

### LandFit / CABN Compatibility (exists, unchanged)
Flow B parcel ranking: geometry, physical fit, topography, regulatory, utilities/existing
conditions, complexity/confidence. Already wired to the provider stack.

### YardFit (new — `src/lib/scoring/yardFitScore.ts`, pure + unit-tested) — Phase 2
For owned-property/ADU placement. Inputs: parcel polygon, model footprint, placement
(center + rotation), marked structures, default setback (5 ft), access-path placeholder,
utility tie-in likelihood. Checks:
- **Boundary fit** — footprint fully inside parcel (hard requirement).
- **Structure clearance** — ≥ 5 ft from any marked structure.
- **Setback buffer** — footprint inside `parcel − setback` buffer.
- **Usable yard area** — enough room remains.
- **Access path** — placeholder check (doesn't block a marked driveway/access).
- **Utility tie-in likelihood** — from the utility provider / heuristic.
- **Confidence** — unknowns (unconfirmed setbacks/zoning) lower confidence rather than
  hard-failing, mirroring the CABN engine.

Output: `YardFitResult { fits: boolean | "unknown"; score: number; placementValid: boolean;
violations: string[]; warnings: string[]; unknowns: string[]; confidence: "High"|"Medium"|"Low" }`.
`placementValid` is recomputed live as the user drags; the score summarizes the best/current
placement.

## Flow A — YardFit studio (Phase 2)

`address → /api/geocode → parcel boundary (by point) → Mapbox renders the lot`. The model
footprint is a draggable + rotatable GeoJSON rectangle sized `widthFt×lengthFt`. Turf.js
recomputes validity on every move:
- inside parcel (`booleanContains`); inside `parcel − setback` (`turf.buffer(parcel,-5,'feet')`);
  ≥ 5 ft from marked structures (`turf.distance`/`booleanIntersects`); clear of the access
  placeholder.
- **Valid → white/green; invalid → red.** Live "Likely fits / Does not fit here" verdict +
  warnings/unknowns ("setbacks need county confirmation", "zoning/ADU rules unconfirmed",
  "utility tie-in needs review"). Presented as early screening, not a permitting decision.

## Flow B — Find land (Phase 1 routing; mostly exists)

Wizard routes into `TonyvilleApp` with the selected model applied. Phase 3 adds a
**TimelinePanel** (permitting/review ~2 months; site prep / delivery placeholders) and a
**NextStepsPanel** (confirm zoning, confirm utilities/septic, schedule Tony review).

## Component plan

```
src/app/page.tsx                       → renders BuildPlanWizard
src/components/plan/
  BuildPlanWizard.tsx                  (step state + URL sync)
  PathStep.tsx
  ModelStep.tsx
  ModelCard.tsx
  PlanSummary.tsx                      (persistent "your CABN" chip)
src/lib/cabnModels.ts                  (shared model source + getCabnModel)
src/lib/buildPlanState.ts (+test)      (parse/serialize BuildPlan to URL; reducer)
-- Phase 2 --
src/components/yardfit/
  YardFitStudio.tsx · AddressSearch.tsx · PlacementMap.tsx · YardFitPanel.tsx
src/lib/geometry/footprint.ts (+test)  (Turf: build/rotate/validate footprint)
src/lib/scoring/yardFitScore.ts (+test)
-- Phase 3 --
src/components/plan/TimelinePanel.tsx · NextStepsPanel.tsx
TonyvilleApp.tsx                       → accepts initialModelId (Flow B)
```

## Phase 1 scope (implement now)

1. `src/lib/cabnModels.ts` — re-export `CABN_MODELS`, add `getCabnModel(id)`.
2. `src/lib/buildPlanState.ts` (+ test) — `parseBuildPlan(searchParams)` /
   `buildPlanToParams(plan)`; default path/model; validation against known model ids.
3. `BuildPlanWizard` + `PathStep` + `ModelStep` + `ModelCard` + `PlanSummary` — the wizard
   UI; URL-synced; "find land" → renders `TonyvilleApp` (model applied); "own property" →
   a Phase-2 placeholder panel ("Placement studio coming next") so the funnel is complete.
4. `src/app/page.tsx` — render the wizard (replacing the direct `TonyvilleApp` mount); when
   `path=find` and a model is chosen, mount `TonyvilleApp` with the model seeded into
   `initialFilters.modelSize`.
5. `TonyvilleApp` — accept an optional `initialModelId`/seeded `modelSize` (minimal, additive;
   the existing search/URL behavior is preserved).

**Phase 1 does not** add Mapbox-drag, Turf, or YardFit scoring (Phase 2), and does not change
the LandFit engine or the provider stack.

## Error handling / non-goals

- The existing Mapbox/Regrid/mock/ATTOM/FEMA/CAL FIRE/USGS/Supabase flows are untouched.
- No new env vars in Phase 1. Turf.js is the only new dependency (Phase 2).
- Wizard degrades gracefully: unknown/absent URL params fall back to defaults (path unset →
  show Step 1; model unset → show Step 2).
- Flow A is an early site-suitability screening tool, not an engineering/permitting decision.

## Testing

- Phase 1: `buildPlanState` (parse/serialize/validation) unit tests; wizard renders the
  right step for given params.
- Phase 2: `footprint` geometry (build/rotate/contains/setback/overlap) and `yardFitScore`
  unit tests (pure, headless).

## UX direction

Full-bleed, one decision per step, large model cards, persistent plan summary, a single
clear CTA. The map appears only inside a flow, framed by guidance — Tesla/Apple/Zillow/
Airbnb, not a technical dashboard.
