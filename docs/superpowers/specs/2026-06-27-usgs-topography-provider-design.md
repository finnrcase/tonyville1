# USGS Topography Provider — Design

- **Date:** 2026-06-27
- **Status:** Approved (design)
- **Branch:** `usgs-topography-provider` (stacked on `fema-flood-provider`)

## Goal

Add a keyless USGS National Map (TNM) topography provider that estimates terrain and
elevation intelligence for a parcel, feeds it into the CABN Compatibility Scoring Engine's
existing 15% Topography category, and surfaces it in the parcel detail panel as an
early-stage site-suitability screening signal (not an engineering report).

## Key decisions (resolved during brainstorming)

1. **Data source = USGS EPQS (keyless).** The USGS Elevation Point Query Service
   (`https://epqs.nationalmap.gov/v1/json`) returns point elevation. No API key; no new env
   vars.
2. **Slope/aspect via multi-point sampling, polygon-aware.** EPQS gives point elevation
   only; slope/max-slope/aspect are derived by sampling multiple points: parcel polygon
   vertices + centroid when a polygon is available, otherwise a 3×3 grid (~30 m) around the
   centroid. Samples run in parallel with per-request timeouts.
3. **Feed into the existing 15% topography category (keep weights).** The CABN
   `topographyCategory` already sums to exactly 15 maxPoints (slope 5 + drainage 3 + cut/
   fill 2 + ridgeline 2 + elevation 1.5 + aspect 1.5) and already scores every requested
   dimension. We map real USGS values into its input and keep the weights; we do not rewrite
   the category. Unknown/unavailable terrain reduces confidence (existing `unknownCheck`s)
   rather than penalizing.

## Non-goals

- No new env vars (EPQS is keyless).
- No CABN engine weight changes.
- No changes to Mapbox/Regrid/mock/ATTOM/FEMA/Supabase flows.
- Not an engineering report — early screening only.

## Output type (verbatim from the request, renamed to avoid a collision)

The engine already has an input type named `TopographyData` (in `parcelEvaluationService`).
The USGS provider output is therefore named **`USGSTopographyData`**:

```ts
export type USGSTopographyData = {
  available: boolean;
  elevationFeet?: number;
  averageSlopePercent?: number;
  maxSlopePercent?: number;
  terrainClass?: "Flat" | "Gentle" | "Moderate" | "Steep" | "Extreme";
  aspect?: "North" | "South" | "East" | "West" | "Mixed";
  drainageRisk?: "Low" | "Medium" | "High" | "Unknown";
  estimatedSiteComplexity?: "Low" | "Medium" | "High" | "Unknown";
  confidence: "High" | "Medium" | "Low";
  notes: string[];
};
```

## EPQS sampling & derivation

- Endpoint: `https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&units=Feet&wkid=4326`.
- Sample set:
  - **Polygon present:** centroid + up to 8 polygon vertices (evenly chosen).
  - **No polygon:** centroid + 8 neighbors on a 3×3 grid at ~30 m spacing.
- Each sample: `{ lat, lng, elevationFeet }` (skip failed samples).
- Derivations (centroid = reference):
  - `elevationFeet` = centroid elevation.
  - For each non-centroid sample: `slopePct_i = |elev_i − elev_centroid| / horizontalMeters_i × 100` (horizontal distance via haversine).
  - `averageSlopePercent` = mean of `slopePct_i`; `maxSlopePercent` = max.
  - `aspect` = compass bucket of the direction toward the **lowest** sample (downhill); `Mixed` when average slope < ~2% (ambiguous).
  - `terrainClass` from `averageSlopePercent`: Flat <2, Gentle 2–8, Moderate 8–15, Steep 15–30, Extreme >30.
  - `drainageRisk`: Flat→Medium (ponding), Gentle/Moderate→Low, Steep/Extreme→Medium (runoff/erosion), unknown→Unknown.
  - `estimatedSiteComplexity`: Flat/Gentle→Low, Moderate→Medium, Steep/Extreme→High, unknown→Unknown.
  - `confidence`: High (polygon vertices + centroid sampled and ≥⅔ succeeded), Medium (grid fallback or partial), Low (≤2 samples or unavailable).

## Error handling & graceful fallback

`getTopography` never throws. If the centroid sample fails or fewer than 2 samples succeed:
`{ available:false, confidence:"Low", notes:["USGS elevation data was unavailable; terrain is unconfirmed."] }`.
The parcel keeps evaluating; the engine treats missing terrain fields as unknown (confidence
reduction), per the requested behavior.

## Files

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/providers/usgsProvider.ts` | **create (server-only)** | `getTopography()` (EPQS sampling + derivation + fallback) and `enricher: ParcelEnricher`. |
| `src/lib/providers/usgsProvider.test.ts` | **create** | EPQS-mocked derivation + fallback tests. |
| `src/types/parcel.ts` | modify | Add `USGSTopographyData`; `topography?` on `ParcelEnrichment` + `EnrichmentFragment`; `"usgs"` in `ProviderName`; `geometry?` on `ParcelLookup`. |
| `src/lib/parcelService.ts` | modify | Register `usgsProvider.enricher`; merge `fragment.topography`. |
| `src/lib/enrichmentClient.ts` | modify | `toParcelLookup` includes `parcel.geometry`. |
| `src/lib/scoring/cabnCompatibilityScore.ts` | modify | Add pure `usgsTopoToCABNTopography()`; use it for the `topography` input in `buildCABNScoringInputFromParcel` when `enrichment.topography` is present. |
| `src/lib/scoring/cabnCompatibilityScore.test.ts` | modify | Mapper + steep-vs-flat effect-on-topography tests. |
| `src/components/ParcelDetailPanel.tsx` | modify | Add the Topography section. |

## CABN mapping (keep weights)

`usgsTopoToCABNTopography(usgs)` → engine `topography` input:
- `slopePct ← averageSlopePercent`
- `elevationFt ← elevationFeet`
- `aspect ← lowercased` (North→north … Mixed→mixed)
- `drainage ← drainageRisk` (Low→good, Medium→moderate, High→poor, Unknown→unknown)
- `cutFillComplexity ← estimatedSiteComplexity`
- `terrainDescription` retained from the parcel.

When `usgs.available === false`, the mapper returns fields `undefined` so the existing
unknown checks apply (confidence reduction, not penalty).

## UI — Topography section (ParcelDetailPanel)

Driven by `enrichment.topography`, with a loading state. Shows: Elevation, Average slope,
Max slope, Terrain class, Solar orientation (aspect), Estimated grading complexity, Drainage
assessment, Confidence. Plus plain-language ✓/⚠ lines explaining the CABN effect, e.g.:

- ✓ Flat site · ✓ Gentle south-facing slope · ✓ Minimal grading expected
- ⚠ Steep hillside · ⚠ Significant grading likely · ⚠ Drainage review recommended

Footer disclaimer: *"Early site-suitability screening from USGS elevation data — not an
engineering or grading report."* Hidden gracefully when no topography data.

## Testing (Vitest)

- `usgsProvider.test.ts` (EPQS mocked): flat samples → Flat/Low complexity; steep samples →
  Steep/High + max slope; aspect from the lowest neighbor; all-fail → available:false,
  confidence Low.
- `cabnCompatibilityScore.test.ts`: `usgsTopoToCABNTopography` mapping; steep USGS topo
  lowers the topography category vs flat.

## Extensibility

Same enricher registry (`parcelService`) and the synchronous provider seam
(`parcelEvaluationService`) remain the integration points, so county GIS, LiDAR, utilities,
and zoning providers plug in later with no pipeline changes.
