# FEMA Flood-Risk Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a keyless FEMA flood-risk provider (NFHL ArcGIS) as an enricher, feed it into the CABN regulatory category, and surface it in the parcel detail panel as an early screening signal.

**Architecture:** `femaProvider` (server-only) exposes `getFloodRisk()` + a `ParcelEnricher` registered in the existing `/api/parcels/enrich` pipeline; the enrichment's `floodRisk` maps to `regulatory.floodZone` consumed by the existing CABN scoring (weights unchanged).

**Spec:** `docs/superpowers/specs/2026-06-27-fema-flood-provider-design.md`

---

## Task 1: Types

**File:** `src/types/parcel.ts`

- [ ] **Step 1: Add `FloodRiskData`** (after the enrichment block, before `ProviderName`):
```ts
export type FloodRiskData = {
  available: boolean;
  floodZone?: string;
  riskLevel: "Low" | "Medium" | "High" | "Unknown";
  source: "FEMA" | "Unavailable";
  notes: string[];
};
```
- [ ] **Step 2: Extend `ProviderName`:** change `export type ProviderName = "attom";` to `export type ProviderName = "attom" | "fema";`
- [ ] **Step 3: Add `floodRisk` to `ParcelEnrichment`:** add `floodRisk?: FloodRiskData;` before `providers: ProviderStatus[];`
- [ ] **Step 4: Add `floodRisk` to the `EnrichmentFragment` Pick:** add `| "floodRisk"` to the union.
- [ ] **Step 5:** `npx tsc --noEmit` → PASS. Commit:
```bash
git add src/types/parcel.ts
git commit -m "feat: add FloodRiskData type and fema provider name"
```

---

## Task 2: femaProvider (TDD)

**Files:** `src/lib/providers/femaProvider.ts`, test `src/lib/providers/femaProvider.test.ts`

- [ ] **Step 1: Write the failing test** (`src/lib/providers/femaProvider.test.ts`):
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFloodRisk } from "@/lib/providers/femaProvider";

function mockFetch(json: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => json }));
}
function feature(attrs: Record<string, string>) {
  return { features: [{ attributes: attrs }] };
}

afterEach(() => vi.unstubAllGlobals());

const pt = { lat: 29.95, lng: -90.07 };

describe("getFloodRisk", () => {
  it("maps a floodway to High / floodway zone string", async () => {
    mockFetch(feature({ FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY", SFHA_TF: "T" }));
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "High", source: "FEMA", floodZone: "AE" });
    expect(r.notes.join(" ").toLowerCase()).toContain("floodway");
  });
  it("maps an SFHA AE zone to High", async () => {
    mockFetch(feature({ FLD_ZONE: "AE", ZONE_SUBTY: "", SFHA_TF: "T" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("High");
  });
  it("maps shaded-X 0.2% to Medium", async () => {
    mockFetch(feature({ FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA_TF: "F" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("Medium");
  });
  it("maps minimal X to Low", async () => {
    mockFetch(feature({ FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("Low");
  });
  it("maps zone D to Unknown but available", async () => {
    mockFetch(feature({ FLD_ZONE: "D", ZONE_SUBTY: "", SFHA_TF: "F" }));
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "Unknown" });
  });
  it("returns available:true Unknown when no polygon is found", async () => {
    mockFetch({ features: [] });
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "Unknown", source: "FEMA" });
  });
  it("returns Unavailable on a non-ok response without throwing", async () => {
    mockFetch({}, false);
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: false, riskLevel: "Unknown", source: "Unavailable" });
  });
  it("returns Unavailable on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect((await getFloodRisk(pt)).source).toBe("Unavailable");
  });
});
```
- [ ] **Step 2:** Run `npm test -- src/lib/providers/femaProvider.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `src/lib/providers/femaProvider.ts`:**
```ts
import "server-only";
import type {
  EnrichmentFragment,
  FloodRiskData,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
} from "@/types/parcel";

const NFHL_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

type Coord = { lat: number; lng: number };
type AttrRecord = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function classify(attrs: AttrRecord): FloodRiskData {
  const zone = str(attrs.FLD_ZONE);
  const subtype = (str(attrs.ZONE_SUBTY) ?? "").toUpperCase();
  const sfha = (str(attrs.SFHA_TF) ?? "").toUpperCase() === "T";

  if (sfha && subtype.includes("FLOODWAY")) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "High",
      source: "FEMA",
      notes: ["Mapped in a regulatory floodway — building is typically prohibited or extremely restricted."],
    };
  }
  if (sfha) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "High",
      source: "FEMA",
      notes: [`Mapped in Special Flood Hazard Area (zone ${zone ?? "A/V"}); elevation and flood permitting review required.`],
    };
  }
  if (subtype.includes("0.2 PCT") || subtype.includes("0.2%")) {
    return {
      available: true,
      floodZone: zone ? `${zone} (0.2% annual)` : "X (0.2% annual)",
      riskLevel: "Medium",
      source: "FEMA",
      notes: ["Near a moderate-risk (0.2% annual chance) flood area; review recommended."],
    };
  }
  if (zone === "D") {
    return {
      available: true,
      floodZone: "D",
      riskLevel: "Unknown",
      source: "FEMA",
      notes: ["FEMA zone D: flood hazard is undetermined; manual review recommended."],
    };
  }
  if (zone) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "Low",
      source: "FEMA",
      notes: ["Outside mapped high-risk flood zones (minimal-risk area)."],
    };
  }
  return {
    available: true,
    riskLevel: "Unknown",
    source: "FEMA",
    notes: ["No FEMA flood polygon found at this point; the area may be unmapped — manual review recommended."],
  };
}

export async function getFloodRisk(point: Coord): Promise<FloodRiskData> {
  const url = new URL(NFHL_URL);
  url.searchParams.set("geometry", `${point.lng},${point.lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "FLD_ZONE,ZONE_SUBTY,SFHA_TF");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      return unavailable(`FEMA NFHL returned ${response.status}`);
    }
    const data = (await response.json()) as { features?: Array<{ attributes?: AttrRecord }>; error?: unknown };
    if (data.error) {
      return unavailable("FEMA NFHL returned an error response");
    }
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) {
      return classify({});
    }
    return classify(attrs);
  } catch {
    return unavailable("FEMA flood data request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(reason: string): FloodRiskData {
  return {
    available: false,
    riskLevel: "Unknown",
    source: "Unavailable",
    notes: [`${reason}; treat flood risk as unconfirmed.`],
  };
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "fema", status: state, message };
}

export const femaEnricher: ParcelEnricher = {
  name: "fema",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const floodRisk = await getFloodRisk({ lat: lookup.lat, lng: lookup.lng });
    return {
      floodRisk,
      status: floodRisk.available
        ? status("ready", "FEMA flood screening loaded.")
        : status("error", "FEMA flood data unavailable."),
    };
  },
};

export const femaProvider = {
  name: "fema" as const,
  enricher: femaEnricher,
  getFloodRisk,
};
```
- [ ] **Step 4:** Run `npm test -- src/lib/providers/femaProvider.test.ts` → PASS (8).
- [ ] **Step 5:** Commit:
```bash
git add src/lib/providers/femaProvider.ts src/lib/providers/femaProvider.test.ts
git commit -m "feat: add FEMA NFHL flood-risk provider with graceful fallback"
```

---

## Task 3: Register the enricher

**File:** `src/lib/parcelService.ts`

- [ ] **Step 1:** Add import: `import { femaProvider } from "@/lib/providers/femaProvider";`
- [ ] **Step 2:** Change the registry: `export const parcelService = createParcelService([attomProvider.enricher, femaProvider.enricher]);`
- [ ] **Step 3:** In `runEnrichers`, after the `estimatedValue` merge line, add:
```ts
      if (fragment.floodRisk) enrichment.floodRisk = fragment.floodRisk;
```
- [ ] **Step 4:** `npx tsc --noEmit` → PASS. Run `npm test -- src/lib/parcelService.test.ts` → PASS. Commit:
```bash
git add src/lib/parcelService.ts
git commit -m "feat: register FEMA enricher in the parcel enrichment pipeline"
```

---

## Task 4: CABN regulatory integration (no weight changes)

**Files:** `src/lib/scoring/cabnCompatibilityScore.ts`, test `src/lib/scoring/cabnCompatibilityScore.test.ts`

- [ ] **Step 1: Add the failing test** to `cabnCompatibilityScore.test.ts`:
```ts
import { floodRiskToCABNZone } from "@/lib/scoring/cabnCompatibilityScore";

describe("floodRiskToCABNZone", () => {
  it("maps risk levels to CABN flood zones", () => {
    expect(floodRiskToCABNZone(undefined)).toBe("unknown");
    expect(floodRiskToCABNZone({ available: false, riskLevel: "Unknown", source: "Unavailable", notes: [] })).toBe("unknown");
    expect(floodRiskToCABNZone({ available: true, riskLevel: "Low", source: "FEMA", notes: [] })).toBe("none");
    expect(floodRiskToCABNZone({ available: true, riskLevel: "Medium", source: "FEMA", notes: [] })).toBe("moderate");
    expect(floodRiskToCABNZone({ available: true, riskLevel: "High", source: "FEMA", notes: [] })).toBe("floodplain");
    expect(floodRiskToCABNZone({ available: true, riskLevel: "High", floodZone: "AE", source: "FEMA", notes: ["regulatory floodway constraint"] })).toBe("floodway");
  });
});
```
- [ ] **Step 2:** Run → FAIL (export missing).
- [ ] **Step 3: Add the mapper** to `cabnCompatibilityScore.ts` (near the `CABNFloodZone` type; import the type):
```ts
import type { FloodRiskData } from "@/types/parcel";

export function floodRiskToCABNZone(flood?: FloodRiskData): CABNFloodZone {
  if (!flood || !flood.available) return "unknown";
  if (flood.riskLevel === "High") {
    const isFloodway = flood.notes.some((note) => note.toLowerCase().includes("floodway"));
    return isFloodway ? "floodway" : "floodplain";
  }
  if (flood.riskLevel === "Medium") return "moderate";
  if (flood.riskLevel === "Low") return "none";
  return "unknown";
}
```
- [ ] **Step 4:** In `buildCABNScoringInputFromParcel`, change `floodZone: "unknown",` (inside the `regulatory:` block) to `floodZone: floodRiskToCABNZone(enrichment?.floodRisk),`
- [ ] **Step 5:** Run `npm test -- src/lib/scoring/cabnCompatibilityScore.test.ts` → PASS. `npx tsc --noEmit` → PASS. Commit:
```bash
git add src/lib/scoring/cabnCompatibilityScore.ts src/lib/scoring/cabnCompatibilityScore.test.ts
git commit -m "feat: feed FEMA flood risk into CABN regulatory scoring"
```

---

## Task 5: UI — Flood / Regulatory section

**File:** `src/components/ParcelDetailPanel.tsx`

- [ ] **Step 1:** Add a presentational `FloodSection` and render it in the detail panel body (near the regulatory content / after the ParcelIntelligence section). It reads `enrichment?.floodRisk` and `enrichmentStatus`:
```tsx
function FloodSection({
  flood,
  loading,
}: {
  flood?: import("@/types/parcel").FloodRiskData;
  loading: boolean;
}) {
  if (loading && !flood) {
    return (
      <DetailSection title="Flood / Regulatory">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#edf0ec]" />
      </DetailSection>
    );
  }
  if (!flood) return null;

  const tone =
    flood.riskLevel === "High"
      ? "text-[#8b3f35]"
      : flood.riskLevel === "Medium"
        ? "text-[#8b6b2d]"
        : flood.riskLevel === "Low"
          ? "text-[#203b2c]"
          : "text-[#56605a]";
  const manualReview =
    !flood.available || flood.riskLevel === "High" || flood.riskLevel === "Unknown";

  return (
    <DetailSection title="Flood / Regulatory">
      <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
        <span className="font-medium text-[#66716a]">Flood risk</span>
        <span className={`font-semibold ${tone}`}>
          {flood.riskLevel}
          {flood.floodZone ? ` · ${flood.floodZone}` : ""}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
        <span className="font-medium text-[#66716a]">FEMA source</span>
        <span className="font-semibold text-[#27302b]">
          {flood.source === "FEMA" ? "FEMA NFHL" : "Unavailable"}
        </span>
      </div>
      {flood.notes.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-xs leading-5 text-[#56605a]">
          {flood.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : null}
      {manualReview ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#fbf4e9] px-3 py-2 text-xs font-semibold text-[#8b6b2d]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Manual flood review recommended.
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early flood screening from FEMA NFHL — not a final permitting or flood-insurance
        determination.
      </p>
    </DetailSection>
  );
}
```
- [ ] **Step 2:** Render `<FloodSection flood={enrichment?.floodRisk} loading={enrichmentStatus === "loading"} />` inside the panel body (e.g., immediately after the `<ParcelIntelligence … />` usage, or after the regulatory category block). `TriangleAlert` and `DetailSection` already exist in the file.
- [ ] **Step 3:** `npx tsc --noEmit && npm run lint` → PASS. Commit:
```bash
git add src/components/ParcelDetailPanel.tsx
git commit -m "feat: add FEMA flood / regulatory section to the detail panel"
```

---

## Task 6: Full verification

- [ ] `npm test 2>&1 | tail -4` → all pass.
- [ ] `npm run lint` → exit 0. `npx tsc --noEmit` → PASS. `npm run build 2>&1 | tail -10` → succeeds.
- [ ] Live FEMA smoke (build done; prod server on a free port), confirm enrich returns floodRisk for a known floodplain parcel via the app, OR directly verify the NFHL mapping with a curl. Stop server after.
- [ ] Commit any remaining changes.

## Self-Review

- Spec coverage: provider file ✓ (Task 2); server-side + graceful fallback ✓; normalized `FloodRiskData` ✓ (Task 1/2); CABN regulatory integration, weights unchanged ✓ (Task 4); UI section (level/source/notes/manual-review/disclaimer) ✓ (Task 5); keyless, no env ✓; extensible (enricher registry) ✓.
- Type consistency: `getFloodRisk`, `femaEnricher`, `femaProvider`, `floodRiskToCABNZone`, `FloodRiskData`, `floodRisk` used consistently across tasks.
