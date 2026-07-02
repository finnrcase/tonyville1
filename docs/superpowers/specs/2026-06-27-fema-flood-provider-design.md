# FEMA / Flood-Risk Provider — Design

- **Date:** 2026-06-27
- **Status:** Approved (design); pending spec review
- **Author:** Finn Case (with Claude Code)
- **Branch:** `fema-flood-provider`

## Goal

Add a keyless FEMA flood-risk provider that, given a parcel's latitude/longitude,
determines whether the parcel is in or near a flood-risk area, integrates the result into
the CABN Compatibility Scoring Engine's **Regulatory** category, and surfaces it in the
parcel detail panel as an **early screening signal** (never a final permitting decision).

## Key decisions (resolved during brainstorming)

1. **Data source = FEMA NFHL ArcGIS (keyless).** OpenFEMA's open-data API
   (`data.fema.gov`) has disaster/NFIP datasets but **does not** return a parcel's flood
   zone by coordinate. The keyless source that does is FEMA's **National Flood Hazard Layer
   (NFHL)** ArcGIS service. Verified reachable; returns `FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF`
   for a point. No API key is added to `.env` (NFHL is keyless).
2. **Wiring = enricher (on parcel select).** `femaProvider` exposes the core
   `getFloodRisk()` function and a `ParcelEnricher` registered in the existing
   `/api/parcels/enrich` pipeline. Flood is fetched server-side when a parcel is selected,
   reusing the existing server+client enrichment cache, and feeds the detail-panel CABN
   score and the UI. List/search scores are unchanged (no N FEMA calls per search).
3. **CABN engine weights unchanged.** The Regulatory category already scores `floodZone`
   (`floodway`=blocker, `floodplain`/`moderate`=warning, `none`=pass, `unknown`=confidence
   reduction). We only feed real FEMA data into it; we do not change weights.

## Non-goals (YAGNI / scope guard)

- No `.env` FEMA key (NFHL is keyless).
- No changes to Mapbox/Regrid/mock/ATTOM/Supabase flows.
- No CABN engine weight changes (only the flood-zone *input* becomes real).
- No OpenFEMA disaster/NFIP augmentation (NFHL zone only).
- FEMA flood is **not** run for every search result — on parcel select only.

## Architecture & data flow

```
User selects a parcel
  → /api/parcels/enrich (server)  →  parcelService runs enrichers in parallel:
        [ attomProvider.enricher, femaProvider.enricher ]
        femaProvider.enricher → getFloodRisk({lat,lng}) → FEMA NFHL ArcGIS query
  → ParcelEnrichment now includes floodRisk: FloodRiskData
  → client caches enrichment (existing session cache)

Detail panel:
  buildCABNScoringInputFromParcel(parcel, enrichment)
    → regulatory.floodZone = floodRiskToCABNZone(enrichment.floodRisk)
    → cabnCompatibilityScore() applies the EXISTING regulatory flood logic
  ParcelDetailPanel renders a Flood / Regulatory section from enrichment.floodRisk
```

The FEMA request only ever runs inside the server-side enrich pipeline
(`femaProvider.ts` is guarded with `import "server-only"`).

## Normalized result type (verbatim from the request)

```ts
type FloodRiskData = {
  available: boolean;
  floodZone?: string;
  riskLevel: "Low" | "Medium" | "High" | "Unknown";
  source: "FEMA" | "Unavailable";
  notes: string[];
};
```

## FEMA NFHL query

- Endpoint: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query`
  (layer 28 = Flood Hazard Zones).
- Params: `geometry={lng},{lat}`, `geometryType=esriGeometryPoint`, `inSR=4326`,
  `spatialRel=esriSpatialRelIntersects`, `outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF`,
  `returnGeometry=false`, `f=json`.
- Request runs server-side with a timeout (AbortController, ~8s).
- **"In or near" interpretation:** this is point-in-zone screening at the parcel centroid.
  "Near"/moderate risk is represented by FEMA's 0.2%-annual-chance (shaded X) band, which
  maps to Medium. Points in unmapped areas return Unknown with a manual-review note. (A true
  geometric buffer/adjacency check is out of scope for this screening signal.)

### Zone mapping

| NFHL result | `riskLevel` | `floodZone` (FloodRiskData) | CABNFloodZone |
| --- | --- | --- | --- |
| `SFHA_TF=T` and `ZONE_SUBTY` contains `FLOODWAY` | High | the `FLD_ZONE` (e.g. `AE`) | `floodway` |
| `SFHA_TF=T` (A, AE, AH, AO, AR, A99, V, VE) | High | the `FLD_ZONE` | `floodplain` |
| `SFHA_TF=F` and `ZONE_SUBTY` contains `0.2 PCT` (shaded X) | Medium | `X (0.2% annual)` | `moderate` |
| `FLD_ZONE=X` minimal / `AREA OF MINIMAL FLOOD HAZARD` | Low | `X` | `none` |
| `FLD_ZONE=D` | Unknown | `D` | `unknown` |

## Error handling & graceful fallback

`getFloodRisk` never throws. Outcomes:

- **Success with polygon** → `{ available:true, floodZone, riskLevel, source:"FEMA", notes }`.
- **Success, no polygon at point** → `{ available:true, riskLevel:"Unknown", source:"FEMA",
  notes:["No FEMA flood polygon found at this point; the area may be unmapped — manual
  review recommended."] }`.
- **Network error / non-OK / timeout / ArcGIS error object** → `{ available:false,
  riskLevel:"Unknown", source:"Unavailable", notes:["FEMA flood data was unavailable;
  treat flood risk as unconfirmed."] }`.

`floodRiskToCABNZone(undefined | unavailable | Unknown)` → `"unknown"`, so the existing
engine reduces confidence rather than penalizing — matching the requested logic
(unknown/unavailable lowers confidence; Medium = warning; High = penalty; floodway =
blocker).

## Files

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/providers/femaProvider.ts` | **create (server-only)** | `getFloodRisk({lat,lng})` (NFHL query + mapping + fallback) and `enricher: ParcelEnricher`. |
| `src/lib/providers/femaProvider.test.ts` | **create** | Mapping + graceful-fallback tests (fetch mocked). |
| `src/types/parcel.ts` | modify | Add `FloodRiskData`; add `floodRisk?` to `ParcelEnrichment` + `EnrichmentFragment`; add `"fema"` to `ProviderName`. |
| `src/lib/parcelService.ts` | modify | Register `femaProvider.enricher`; merge `fragment.floodRisk`. |
| `src/lib/scoring/cabnCompatibilityScore.ts` | modify | Add pure `floodRiskToCABNZone()`; use it for `regulatory.floodZone` in `buildCABNScoringInputFromParcel`. (No weight changes; `floodRiskToCABNZone` is client-safe — not server-only.) |
| `src/lib/scoring/cabnCompatibilityScore.test.ts` | modify | Add `floodRiskToCABNZone` + flood-effect-on-regulatory cases. |
| `src/components/ParcelDetailPanel.tsx` | modify | Add the Flood / Regulatory section. |

## UI — Flood / Regulatory section (ParcelDetailPanel)

Driven by `enrichment.floodRisk`, with a loading state while `enrichmentStatus === "loading"`.
Shows:
- **Flood risk level** (Low / Medium / High / Unknown) with a color cue.
- **FEMA source status** (`FEMA` vs `Unavailable`).
- **Notes** (the `notes[]` array).
- **Manual review recommended** flag — shown when `riskLevel` is `High` or `Unknown`, or
  when `available === false`.
- Footer disclaimer: *"Early flood screening from FEMA NFHL — not a final permitting or
  flood-insurance determination."*

Hidden gracefully when there is no flood data (e.g., before enrichment resolves and no
cached value).

## Testing (Vitest)

- `femaProvider.test.ts` (fetch mocked, `server-only` stubbed by existing Vitest alias):
  floodway → High/`floodway`; SFHA AE → High/`floodplain`; 0.2% shaded X → Medium/
  `moderate`; minimal X → Low/`none`; zone D → Unknown/`unknown`; non-OK → unavailable;
  empty features → available+Unknown.
- `cabnCompatibilityScore.test.ts`: `floodRiskToCABNZone` mapping; a `floodplain` floodRisk
  lowers the regulatory score vs `none`; a `floodway` floodRisk produces a regulatory
  blocker.

## Security / correctness

- NFHL request is server-only; the browser never calls FEMA directly.
- No secrets involved (keyless).
- ArcGIS response treated as untrusted: parse defensively, render notes as React text.
- Presented strictly as an early screening signal, not a permitting/insurance decision.

## Open items for implementation

- Confirm the user's in-progress working-tree changes (CABN engine / providers / panel) are
  committed or intended, since FEMA edits touch some of those files.
