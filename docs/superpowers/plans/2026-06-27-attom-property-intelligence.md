# ATTOM Property Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ATTOM as a server-side, display-only property-intelligence enrichment layer for the parcel detail panel, with Regrid remaining the primary parcel source.

**Architecture:** A `ParcelEnricher` registry inside a server-only `parcelService` runs providers (ATTOM now) in parallel and merges typed fragments into one `ParcelEnrichment`. The client calls a secure `POST /api/parcels/enrich` proxy when a parcel is selected, caches results per session, and renders graceful, individually-hideable sections. The ATTOM key never leaves the server. The scoring engine is untouched; "Tonyville Fit Score" is only relabeled "LandFit Score".

**Tech Stack:** Next.js 16 App Router (modified — see `node_modules/next/dist/docs/`), TypeScript, React 19, Tailwind v4, Vitest (new), `server-only` (new).

**Spec:** `docs/superpowers/specs/2026-06-27-attom-property-intelligence-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `package.json` | modify | Add `test`/`test:watch` scripts + `vitest`, `server-only`. |
| `vitest.config.ts` | create | Node test env + `@/` alias. |
| `src/lib/format.test.ts` | create | Smoke test proving runner + alias work. |
| `src/types/parcel.ts` | modify | Add enrichment interfaces (`ParcelLookup`, `ParcelDetails`, `Assessment`, `SalesHistory`, `Utilities`, `PropertyFeatures`, `ProviderStatus`, `EnrichmentFragment`, `ParcelEnricher`, `ParcelEnrichment`). |
| `src/lib/attom.ts` | create (server-only) | ATTOM client + mapping + defensive lookup cascade; exports `attomEnricher`. |
| `src/lib/attom.test.ts` | create | Mapping, cascade, graceful-status tests (fetch mocked). |
| `src/lib/parcelService.ts` | create (server-only) | `createParcelService(enrichers)` factory: parallel run, merge, TTL cache, in-flight de-dup; default `parcelService`. |
| `src/lib/parcelService.test.ts` | create | Merge, cache hit/miss/TTL, de-dup, failing-enricher isolation. |
| `src/app/api/parcels/enrich/route.ts` | create | `POST` proxy: validate body → `parcelService.enrichParcel`. |
| `src/app/api/parcels/enrich/route.test.ts` | create | 400/422/200 behavior (parcelService mocked). |
| `src/lib/enrichmentClient.ts` | create (client) | `toParcelLookup`, `fetchEnrichment` (+ session cache), `useParcelEnrichment` hook. |
| `src/lib/enrichmentClient.test.ts` | create | `toParcelLookup` mapping + `fetchEnrichment` caching (fetch mocked). |
| `src/components/ParcelIntelligence.tsx` | create (client) | Renders ATTOM-backed sections with skeletons + graceful hiding. |
| `src/components/ParcelDetailPanel.tsx` | modify | Accept enrichment props, render `<ParcelIntelligence>`, relabel Compatibility + Score. |
| `src/components/TonyvilleApp.tsx` | modify | Call `useParcelEnrichment(selectedParcel)`, pass into the panel. |

---

## Task 1: Set up Vitest + server-only

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/format.test.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install -D vitest
npm install server-only
```
Expected: both install without errors; `package.json` gains `vitest` (devDependencies) and `server-only` (dependencies).

- [ ] **Step 2: Add test scripts**

In `package.json`, change the `scripts` block to:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Write a smoke test (proves runner + `@/` alias)**

Create `src/lib/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";

describe("format helpers", () => {
  it("formats currency without cents", () => {
    expect(formatCurrency.format(140000)).toBe("$140,000");
  });

  it("formats acres and miles with one decimal", () => {
    expect(formatAcres(0.5)).toBe("0.5 ac");
    expect(formatMiles(12.34)).toBe("12.3 mi");
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS — `format helpers` 3 assertions green; confirms the `@/` alias resolves in Vitest.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/format.test.ts
git commit -m "chore: add Vitest test runner and server-only"
```

---

## Task 2: Enrichment types

**Files:**
- Modify: `src/types/parcel.ts` (append at end of file)

- [ ] **Step 1: Append enrichment interfaces**

Add to the end of `src/types/parcel.ts`:
```ts
// --- Property-intelligence enrichment (ATTOM and future providers) ---

export type ParcelLookup = {
  id: string;
  address: string;
  city: string;
  state: string;
  county: string;
  apn?: string;
  fips?: string;
  lat: number;
  lng: number;
};

export type ParcelDetails = {
  propertyType?: string;
  lotSizeAcres?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  landUse?: string;
  legalDescription?: string;
  ownerOccupied?: boolean;
};

export type Assessment = {
  assessedValue?: number;
  marketValue?: number;
  assessmentYear?: number;
  taxAmount?: number;
  taxYear?: number;
  taxRatePct?: number;
};

export type SaleRecord = {
  date?: string;
  price?: number;
  buyer?: string;
  seller?: string;
  docType?: string;
};

export type SalesHistory = SaleRecord[];

export type EnrichedUtilities = {
  water?: boolean;
  electricity?: boolean;
  sewerSeptic?: boolean;
  gas?: boolean;
  source: "regrid" | "attom" | "inferred";
};

export type PropertyFeatures = {
  beds?: number;
  baths?: number;
  buildingSqft?: number;
  stories?: number;
  construction?: string;
  roof?: string;
  heating?: string;
  cooling?: string;
  garage?: string;
};

export type ProviderName = "attom";

export type ProviderStatus = {
  name: ProviderName;
  status: "ready" | "empty" | "missing-key" | "error";
  message: string;
};

export type ParcelEnrichment = {
  parcelId: string;
  details?: ParcelDetails;
  assessment?: Assessment;
  salesHistory?: SalesHistory;
  propertyFeatures?: PropertyFeatures;
  utilities?: EnrichedUtilities;
  estimatedValue?: number;
  providers: ProviderStatus[];
};

export type EnrichmentFragment = Partial<
  Pick<
    ParcelEnrichment,
    | "details"
    | "assessment"
    | "salesHistory"
    | "propertyFeatures"
    | "utilities"
    | "estimatedValue"
  >
> & { status: ProviderStatus };

export type ParcelEnricher = {
  name: ProviderName;
  enrich(lookup: ParcelLookup): Promise<EnrichmentFragment>;
};
```

> **Note:** the enrichment-level utilities type is named `EnrichedUtilities` to avoid colliding with the existing `SearchFilters["utilities"]` / `Parcel["utilities"]` (`Record<UtilityKey, boolean>`). The spec calls it `Utilities`; `EnrichedUtilities` is that interface.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/parcel.ts
git commit -m "feat: add parcel enrichment types"
```

---

## Task 3: ATTOM provider (`attom.ts`)

**Files:**
- Create: `src/lib/attom.ts`
- Test: `src/lib/attom.test.ts`

ATTOM Property API base: `https://api.gateway.attomdata.com/propertyapi/v1.0.0`. Auth header `apikey`. Lookup cascade: `byAddress` → `byApnFips` → `byLatLng`; first strategy returning a property wins. All network/parse failures resolve to a graceful `EnrichmentFragment` (never throw).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/attom.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attomEnricher } from "@/lib/attom";
import type { ParcelLookup } from "@/types/parcel";

const lookup: ParcelLookup = {
  id: "regrid-123",
  address: "123 Main St",
  city: "Bastrop",
  state: "TX",
  county: "Bastrop",
  apn: "R12345",
  fips: "48021",
  lat: 30.11,
  lng: -97.31,
};

const detailResponse = {
  status: { code: 0, msg: "SuccessWithResult", total: 1 },
  property: [
    {
      identifier: { attomId: 145678, apn: "R12345", fips: "48021" },
      lot: { lotsize1: 0.5, lotsize2: 21780 },
      summary: { propclass: "Single Family Residence", yearbuilt: 1998 },
      building: {
        size: { livingsize: 1800 },
        rooms: { beds: 3, bathstotal: 2 },
        construction: { constructiontype: "Frame" },
        summary: { levels: 1 },
        interior: { heating: "Central", cooling: "Central" },
        parking: { garagetype: "Attached" },
      },
      assessment: {
        assessed: { assdttlvalue: 250000 },
        market: { mktttlvalue: 300000 },
        tax: { taxamt: 5400, taxyear: 2024 },
      },
    },
  ],
};

const salesResponse = {
  status: { code: 0, total: 1 },
  property: [
    {
      salehistory: [
        { amount: { saleamt: 280000, salerecdate: "2019-06-05" } },
      ],
    },
  ],
};

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json: unknown }>) {
  const fn = vi.fn();
  responses.forEach((r) => {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv("ATTOM_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("attomEnricher", () => {
  it("returns missing-key status when the key is absent", async () => {
    vi.stubEnv("ATTOM_API_KEY", "");
    const fragment = await attomEnricher.enrich(lookup);
    expect(fragment.status.status).toBe("missing-key");
    expect(fragment.details).toBeUndefined();
  });

  it("maps a successful address lookup into a typed fragment", async () => {
    mockFetchSequence([
      { ok: true, json: detailResponse }, // byAddress detail
      { ok: true, json: salesResponse }, // sales history
    ]);
    const fragment = await attomEnricher.enrich(lookup);

    expect(fragment.status.status).toBe("ready");
    expect(fragment.details).toMatchObject({
      propertyType: "Single Family Residence",
      lotSizeAcres: 0.5,
      yearBuilt: 1998,
    });
    expect(fragment.assessment).toMatchObject({
      assessedValue: 250000,
      marketValue: 300000,
      taxAmount: 5400,
      taxYear: 2024,
    });
    expect(fragment.propertyFeatures).toMatchObject({ beds: 3, baths: 2, buildingSqft: 1800 });
    expect(fragment.salesHistory).toEqual([{ price: 280000, date: "2019-06-05" }]);
  });

  it("falls through to lat/lng when address returns no property", async () => {
    mockFetchSequence([
      { ok: true, json: { status: { code: 1, total: 0 }, property: [] } }, // byAddress empty
      { ok: false, status: 400, json: {} }, // byApnFips error
      { ok: true, json: detailResponse }, // byLatLng detail
      { ok: true, json: salesResponse }, // sales history
    ]);
    const fragment = await attomEnricher.enrich(lookup);
    expect(fragment.status.status).toBe("ready");
    expect(fragment.details?.lotSizeAcres).toBe(0.5);
  });

  it("returns empty status when every strategy finds nothing", async () => {
    mockFetchSequence([
      { ok: true, json: { property: [] } },
      { ok: true, json: { property: [] } },
      { ok: true, json: { property: [] } },
    ]);
    const fragment = await attomEnricher.enrich(lookup);
    expect(fragment.status.status).toBe("empty");
    expect(fragment.details).toBeUndefined();
  });

  it("returns error status on a 401 without throwing", async () => {
    mockFetchSequence([
      { ok: false, status: 401, json: {} },
      { ok: false, status: 401, json: {} },
      { ok: false, status: 401, json: {} },
    ]);
    const fragment = await attomEnricher.enrich(lookup);
    expect(fragment.status.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/attom.test.ts`
Expected: FAIL — `Cannot find module '@/lib/attom'` (file not created yet).

- [ ] **Step 3: Implement `attom.ts`**

Create `src/lib/attom.ts`:
```ts
import "server-only";
import type {
  Assessment,
  EnrichmentFragment,
  ParcelDetails,
  ParcelEnricher,
  ParcelLookup,
  PropertyFeatures,
  ProviderStatus,
  SalesHistory,
} from "@/types/parcel";

const ATTOM_BASE_URL = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

type AttomRecord = Record<string, unknown>;

function obj(value: unknown): AttomRecord {
  return value && typeof value === "object" ? (value as AttomRecord) : {};
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function attomFetch(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<{ ok: boolean; status: number; property: AttomRecord[] }> {
  const url = new URL(`${ATTOM_BASE_URL}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { apikey: token, Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return { ok: false, status: response.status, property: [] };
  }

  const data = obj(await response.json());
  const property = Array.isArray(data.property) ? (data.property as AttomRecord[]) : [];
  return { ok: true, status: response.status, property };
}

type Strategy = {
  path: string;
  params: Record<string, string>;
};

function buildStrategies(lookup: ParcelLookup): Strategy[] {
  const strategies: Strategy[] = [];

  if (lookup.address && lookup.city && lookup.state) {
    strategies.push({
      path: "property/detail",
      params: { address1: lookup.address, address2: `${lookup.city}, ${lookup.state}` },
    });
  }

  if (lookup.apn && lookup.fips) {
    strategies.push({
      path: "property/detail",
      params: { apn: lookup.apn, fips: lookup.fips },
    });
  }

  if (Number.isFinite(lookup.lat) && Number.isFinite(lookup.lng)) {
    strategies.push({
      path: "property/snapshot",
      params: { latitude: String(lookup.lat), longitude: String(lookup.lng), radius: "0.05" },
    });
  }

  return strategies;
}

function mapDetails(property: AttomRecord): ParcelDetails {
  const lot = obj(property.lot);
  const summary = obj(property.summary);
  return {
    propertyType: str(summary.propclass) ?? str(summary.proptype),
    lotSizeAcres: num(lot.lotsize1),
    lotSizeSqft: num(lot.lotsize2),
    yearBuilt: num(summary.yearbuilt),
    landUse: str(summary.propLandUse) ?? str(summary.propsubtype),
  };
}

function mapAssessment(property: AttomRecord): Assessment {
  const assessment = obj(property.assessment);
  const assessed = obj(assessment.assessed);
  const market = obj(assessment.market);
  const tax = obj(assessment.tax);
  return {
    assessedValue: num(assessed.assdttlvalue),
    marketValue: num(market.mktttlvalue),
    taxAmount: num(tax.taxamt),
    taxYear: num(tax.taxyear),
  };
}

function mapFeatures(property: AttomRecord): PropertyFeatures {
  const building = obj(property.building);
  const size = obj(building.size);
  const rooms = obj(building.rooms);
  const construction = obj(building.construction);
  const buildingSummary = obj(building.summary);
  const interior = obj(building.interior);
  const parking = obj(building.parking);
  return {
    beds: num(rooms.beds),
    baths: num(rooms.bathstotal),
    buildingSqft: num(size.livingsize) ?? num(size.universalsize) ?? num(size.bldgsize),
    stories: num(buildingSummary.levels),
    construction: str(construction.constructiontype),
    heating: str(interior.heating),
    cooling: str(interior.cooling),
    garage: str(parking.garagetype),
  };
}

function hasAnyValue(record: Record<string, unknown>): boolean {
  return Object.values(record).some((value) => value !== undefined);
}

async function fetchSalesHistory(
  attomId: string,
  token: string,
): Promise<SalesHistory | undefined> {
  try {
    const result = await attomFetch("saleshistory/detail", { attomid: attomId }, token);
    const property = result.property[0];
    if (!property) return undefined;

    const history = Array.isArray(property.salehistory)
      ? (property.salehistory as AttomRecord[])
      : [];
    const records = history
      .map((entry) => {
        const amount = obj(entry.amount);
        return {
          price: num(amount.saleamt) ?? num(obj(entry.saleamt).saleamt),
          date:
            str(amount.salerecdate) ??
            str(entry.salesearchdate) ??
            str(entry.saleTransDate),
        };
      })
      .filter((record) => record.price !== undefined || record.date !== undefined);

    return records.length > 0 ? records : undefined;
  } catch {
    return undefined;
  }
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "attom", status: state, message };
}

export const attomEnricher: ParcelEnricher = {
  name: "attom",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const token = process.env.ATTOM_API_KEY;
    if (!token) {
      return { status: status("missing-key", "ATTOM_API_KEY is not configured.") };
    }

    let property: AttomRecord | undefined;
    let sawError = false;

    for (const strategy of buildStrategies(lookup)) {
      try {
        const result = await attomFetch(strategy.path, strategy.params, token);
        if (!result.ok) {
          sawError = true;
          continue;
        }
        if (result.property[0]) {
          property = result.property[0];
          break;
        }
      } catch {
        sawError = true;
      }
    }

    if (!property) {
      return sawError
        ? { status: status("error", "ATTOM lookups failed for this parcel.") }
        : { status: status("empty", "ATTOM returned no match for this parcel.") };
    }

    const details = mapDetails(property);
    const assessment = mapAssessment(property);
    const propertyFeatures = mapFeatures(property);
    const estimatedValue = num(obj(obj(property.avm).amount).value);

    const attomId = str(obj(property.identifier).attomId) ?? num(obj(property.identifier).attomId)?.toString();
    const salesHistory = attomId ? await fetchSalesHistory(attomId, token) : undefined;

    return {
      status: status("ready", "ATTOM property data loaded."),
      details: hasAnyValue(details) ? details : undefined,
      assessment: hasAnyValue(assessment) ? assessment : undefined,
      propertyFeatures: hasAnyValue(propertyFeatures) ? propertyFeatures : undefined,
      estimatedValue,
      salesHistory,
    };
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/attom.test.ts`
Expected: PASS — all 5 `attomEnricher` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attom.ts src/lib/attom.test.ts
git commit -m "feat: add ATTOM provider with defensive lookup cascade"
```

---

## Task 4: Parcel service (`parcelService.ts`)

**Files:**
- Create: `src/lib/parcelService.ts`
- Test: `src/lib/parcelService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/parcelService.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { createParcelService } from "@/lib/parcelService";
import type { EnrichmentFragment, ParcelEnricher, ParcelLookup } from "@/types/parcel";

const lookup: ParcelLookup = {
  id: "regrid-1",
  address: "1 A St",
  city: "Bastrop",
  state: "TX",
  county: "Bastrop",
  lat: 30.1,
  lng: -97.3,
};

function fakeEnricher(fragment: EnrichmentFragment, spy = vi.fn()): ParcelEnricher {
  return {
    name: "attom",
    enrich: async (l) => {
      spy(l);
      return fragment;
    },
  };
}

const readyFragment: EnrichmentFragment = {
  status: { name: "attom", status: "ready", message: "ok" },
  details: { yearBuilt: 1998 },
  estimatedValue: 300000,
};

describe("parcelService", () => {
  it("merges fragments and records provider status", async () => {
    const service = createParcelService([fakeEnricher(readyFragment)]);
    const result = await service.enrichParcel(lookup);
    expect(result.parcelId).toBe("regrid-1");
    expect(result.details).toEqual({ yearBuilt: 1998 });
    expect(result.estimatedValue).toBe(300000);
    expect(result.providers).toEqual([{ name: "attom", status: "ready", message: "ok" }]);
  });

  it("caches the result so a second call does not re-run the enricher", async () => {
    const spy = vi.fn();
    const service = createParcelService([fakeEnricher(readyFragment, spy)]);
    await service.enrichParcel(lookup);
    await service.enrichParcel(lookup);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-runs the enricher after the TTL expires", async () => {
    const spy = vi.fn();
    let now = 1000;
    const service = createParcelService([fakeEnricher(readyFragment, spy)], {
      ttlMs: 100,
      now: () => now,
    });
    await service.enrichParcel(lookup);
    now = 1201; // past ttl
    await service.enrichParcel(lookup);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("de-dupes concurrent in-flight requests for the same parcel", async () => {
    const spy = vi.fn();
    let resolve!: (f: EnrichmentFragment) => void;
    const enricher: ParcelEnricher = {
      name: "attom",
      enrich: (l) => {
        spy(l);
        return new Promise((r) => {
          resolve = r;
        });
      },
    };
    const service = createParcelService([enricher]);
    const a = service.enrichParcel(lookup);
    const b = service.enrichParcel(lookup);
    resolve(readyFragment);
    await Promise.all([a, b]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("isolates a failing enricher and reports it as error", async () => {
    const failing: ParcelEnricher = {
      name: "attom",
      enrich: async () => {
        throw new Error("boom");
      },
    };
    const service = createParcelService([failing]);
    const result = await service.enrichParcel(lookup);
    expect(result.providers[0].status).toBe("error");
    expect(result.details).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/parcelService.test.ts`
Expected: FAIL — `Cannot find module '@/lib/parcelService'`.

- [ ] **Step 3: Implement `parcelService.ts`**

Create `src/lib/parcelService.ts`:
```ts
import "server-only";
import { attomEnricher } from "@/lib/attom";
import type {
  ParcelEnricher,
  ParcelEnrichment,
  ParcelLookup,
} from "@/types/parcel";

type CacheEntry = { value: ParcelEnrichment; expires: number };

type ServiceOptions = {
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = Number(process.env.ATTOM_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;

export function createParcelService(
  enrichers: ParcelEnricher[],
  options: ServiceOptions = {},
) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<ParcelEnrichment>>();

  async function runEnrichers(lookup: ParcelLookup): Promise<ParcelEnrichment> {
    const results = await Promise.allSettled(
      enrichers.map((enricher) => enricher.enrich(lookup)),
    );

    const enrichment: ParcelEnrichment = { parcelId: lookup.id, providers: [] };

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        enrichment.providers.push({
          name: enrichers[index].name,
          status: "error",
          message: String(result.reason),
        });
        return;
      }

      const fragment = result.value;
      enrichment.providers.push(fragment.status);
      if (fragment.details) enrichment.details = fragment.details;
      if (fragment.assessment) enrichment.assessment = fragment.assessment;
      if (fragment.salesHistory) enrichment.salesHistory = fragment.salesHistory;
      if (fragment.propertyFeatures) enrichment.propertyFeatures = fragment.propertyFeatures;
      if (fragment.utilities) enrichment.utilities = fragment.utilities;
      if (fragment.estimatedValue !== undefined) {
        enrichment.estimatedValue = fragment.estimatedValue;
      }
    });

    return enrichment;
  }

  async function enrichParcel(lookup: ParcelLookup): Promise<ParcelEnrichment> {
    const cached = cache.get(lookup.id);
    if (cached && cached.expires > now()) {
      return cached.value;
    }

    const inflight = pending.get(lookup.id);
    if (inflight) {
      return inflight;
    }

    const promise = runEnrichers(lookup)
      .then((value) => {
        cache.set(lookup.id, { value, expires: now() + ttlMs });
        pending.delete(lookup.id);
        return value;
      })
      .catch((error) => {
        pending.delete(lookup.id);
        throw error;
      });

    pending.set(lookup.id, promise);
    return promise;
  }

  return { enrichParcel, clearCache: () => cache.clear() };
}

export const parcelService = createParcelService([attomEnricher]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/parcelService.test.ts`
Expected: PASS — all 5 `parcelService` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parcelService.ts src/lib/parcelService.test.ts
git commit -m "feat: add parcelService enricher registry with cache and de-dup"
```

---

## Task 5: Secure proxy route (`/api/parcels/enrich`)

**Files:**
- Create: `src/app/api/parcels/enrich/route.ts`
- Test: `src/app/api/parcels/enrich/route.test.ts`

> Modified-Next.js note: route handlers are standard App Router (`route.ts`, exported HTTP verbs, not cached by default). The handler is a plain async function, so it is unit-testable by calling `POST(request)` directly with a `Request`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/parcels/enrich/route.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

const enrichParcel = vi.fn();
vi.mock("@/lib/parcelService", () => ({
  parcelService: { enrichParcel },
}));

import { POST } from "@/app/api/parcels/enrich/route";

const validBody = {
  id: "regrid-1",
  address: "1 A St",
  city: "Bastrop",
  state: "TX",
  county: "Bastrop",
  lat: 30.1,
  lng: -97.3,
};

function postRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/parcels/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/parcels/enrich", () => {
  it("returns 400 for invalid JSON", async () => {
    const response = await POST(postRequest("not json{", true) as never);
    expect(response.status).toBe(400);
  });

  it("returns 422 for a body missing required fields", async () => {
    const response = await POST(postRequest({ id: "x" }) as never);
    expect(response.status).toBe(422);
  });

  it("returns 200 with enrichment for a valid body", async () => {
    enrichParcel.mockResolvedValueOnce({ parcelId: "regrid-1", providers: [] });
    const response = await POST(postRequest(validBody) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ parcelId: "regrid-1", providers: [] });
    expect(enrichParcel).toHaveBeenCalledWith(expect.objectContaining({ id: "regrid-1" }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/api/parcels/enrich/route.test.ts`
Expected: FAIL — cannot find the route module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/parcels/enrich/route.ts`:
```ts
import { NextResponse } from "next/server";
import { parcelService } from "@/lib/parcelService";
import type { ParcelEnrichment, ParcelLookup } from "@/types/parcel";

export const dynamic = "force-dynamic";

function isValidLookup(body: unknown): body is ParcelLookup {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    b.id.length > 0 &&
    b.id.length <= 128 &&
    typeof b.address === "string" &&
    typeof b.city === "string" &&
    typeof b.state === "string" &&
    typeof b.county === "string" &&
    typeof b.lat === "number" &&
    Number.isFinite(b.lat) &&
    typeof b.lng === "number" &&
    Number.isFinite(b.lng)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidLookup(body)) {
    return NextResponse.json({ error: "Invalid parcel lookup" }, { status: 422 });
  }

  const enrichment = await parcelService.enrichParcel(body);
  return NextResponse.json(enrichment satisfies ParcelEnrichment);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/app/api/parcels/enrich/route.test.ts`
Expected: PASS — all 3 route tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/parcels/enrich/route.ts src/app/api/parcels/enrich/route.test.ts
git commit -m "feat: add secure ATTOM enrichment proxy route"
```

---

## Task 6: Client enrichment hook (`enrichmentClient.ts`)

**Files:**
- Create: `src/lib/enrichmentClient.ts`
- Test: `src/lib/enrichmentClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/enrichmentClient.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearEnrichmentClientCache,
  fetchEnrichment,
  toParcelLookup,
} from "@/lib/enrichmentClient";
import type { Parcel } from "@/types/parcel";

const parcel = {
  id: "regrid-1",
  address: "1 A St",
  city: "Bastrop",
  state: "TX",
  county: "Bastrop",
  providerParcelId: "R12345",
  lat: 30.1,
  lng: -97.3,
} as Parcel;

afterEach(() => {
  __clearEnrichmentClientCache();
  vi.unstubAllGlobals();
});

describe("toParcelLookup", () => {
  it("derives a lookup from a parcel, mapping providerParcelId to apn", () => {
    expect(toParcelLookup(parcel)).toEqual({
      id: "regrid-1",
      address: "1 A St",
      city: "Bastrop",
      state: "TX",
      county: "Bastrop",
      apn: "R12345",
      lat: 30.1,
      lng: -97.3,
    });
  });
});

describe("fetchEnrichment", () => {
  it("calls the proxy once and caches by parcel id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ parcelId: "regrid-1", providers: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const lookup = toParcelLookup(parcel);
    const first = await fetchEnrichment(lookup);
    const second = await fetchEnrichment(lookup);

    expect(first).toEqual({ parcelId: "regrid-1", providers: [] });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/parcels/enrich", expect.objectContaining({ method: "POST" }));
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchEnrichment(toParcelLookup(parcel))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/enrichmentClient.test.ts`
Expected: FAIL — cannot find the module.

- [ ] **Step 3: Implement `enrichmentClient.ts`**

Create `src/lib/enrichmentClient.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import type { Parcel, ParcelEnrichment, ParcelLookup } from "@/types/parcel";

const sessionCache = new Map<string, ParcelEnrichment>();

export function __clearEnrichmentClientCache() {
  sessionCache.clear();
}

export function toParcelLookup(parcel: Parcel): ParcelLookup {
  return {
    id: parcel.id,
    address: parcel.address,
    city: parcel.city,
    state: parcel.state,
    county: parcel.county,
    apn: parcel.providerParcelId,
    lat: parcel.lat,
    lng: parcel.lng,
  };
}

export async function fetchEnrichment(
  lookup: ParcelLookup,
  signal?: AbortSignal,
): Promise<ParcelEnrichment> {
  const cached = sessionCache.get(lookup.id);
  if (cached) return cached;

  const response = await fetch("/api/parcels/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(lookup),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Enrichment request failed: ${response.status}`);
  }

  const data = (await response.json()) as ParcelEnrichment;
  sessionCache.set(lookup.id, data);
  return data;
}

export type EnrichmentStatus = "idle" | "loading" | "ready" | "error";

export function useParcelEnrichment(parcel?: Parcel): {
  status: EnrichmentStatus;
  data?: ParcelEnrichment;
} {
  const [status, setStatus] = useState<EnrichmentStatus>("idle");
  const [data, setData] = useState<ParcelEnrichment | undefined>(undefined);

  useEffect(() => {
    if (!parcel) {
      setStatus("idle");
      setData(undefined);
      return;
    }

    const cached = sessionCache.get(parcel.id);
    if (cached) {
      setData(cached);
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setData(undefined);

    fetchEnrichment(toParcelLookup(parcel), controller.signal)
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id]);

  return { status, data };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/enrichmentClient.test.ts`
Expected: PASS — `toParcelLookup` + `fetchEnrichment` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichmentClient.ts src/lib/enrichmentClient.test.ts
git commit -m "feat: add client enrichment hook with session cache"
```

---

## Task 7: Property intelligence UI (`ParcelIntelligence.tsx`)

**Files:**
- Create: `src/components/ParcelIntelligence.tsx`

This component renders the ATTOM-backed sections. While `status === "loading"` it shows skeletons; when `ready`, each section renders only if its data exists.

- [ ] **Step 1: Implement `ParcelIntelligence.tsx`**

Create `src/components/ParcelIntelligence.tsx`:
```tsx
"use client";

import type { ReactNode } from "react";
import { Building2, FileText, Landmark, Receipt, TrendingUp } from "lucide-react";
import { formatAcres, formatCurrency } from "@/lib/format";
import type { EnrichmentStatus } from "@/lib/enrichmentClient";
import type { ParcelEnrichment, ScoredParcel } from "@/types/parcel";

type ParcelIntelligenceProps = {
  parcel: ScoredParcel;
  enrichment?: ParcelEnrichment;
  status: EnrichmentStatus;
};

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#edf0ec] bg-white p-4 shadow-[0_8px_24px_rgba(22,24,23,0.04)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#111817]">
        {icon}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded-full bg-[#edf0ec]" />
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
      <span className="font-medium text-[#66716a]">{label}</span>
      <span className="font-mono font-semibold text-[#111817]">{value}</span>
    </div>
  );
}

export function ParcelIntelligence({ parcel, enrichment, status }: ParcelIntelligenceProps) {
  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Section title="Estimated Value" icon={<TrendingUp className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={2} />
        </Section>
        <Section title="Property Taxes" icon={<Receipt className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={3} />
        </Section>
        <Section title="Previous Sale History" icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={3} />
        </Section>
      </div>
    );
  }

  if (status === "error" || status === "idle") {
    return null;
  }

  const details = enrichment?.details;
  const assessment = enrichment?.assessment;
  const features = enrichment?.propertyFeatures;
  const sales = enrichment?.salesHistory ?? [];
  const estimatedValue = enrichment?.estimatedValue;
  const attomReady = enrichment?.providers.some(
    (provider) => provider.name === "attom" && provider.status === "ready",
  );

  const lotAcres = details?.lotSizeAcres ?? parcel.acreage;

  return (
    <div className="space-y-4">
      <Section title="Property Overview" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
        <div className="grid gap-2">
          {details?.propertyType ? <Row label="Type" value={details.propertyType} /> : null}
          {details?.landUse ? <Row label="Land use" value={details.landUse} /> : null}
          {details?.yearBuilt ? <Row label="Year built" value={String(details.yearBuilt)} /> : null}
          <Row label="County" value={`${parcel.county}, ${parcel.state}`} />
        </div>
      </Section>

      <Section title="Lot Size" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
        <div className="grid gap-2">
          <Row label="Acreage" value={formatAcres(lotAcres)} />
          {details?.lotSizeSqft ? (
            <Row label="Square feet" value={`${details.lotSizeSqft.toLocaleString()} sqft`} />
          ) : null}
        </div>
      </Section>

      {estimatedValue !== undefined ? (
        <Section title="Estimated Value" icon={<TrendingUp className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="font-mono text-2xl font-semibold text-[#203b2c]">
            {formatCurrency.format(estimatedValue)}
          </div>
          <p className="mt-1 text-xs text-[#66716a]">ATTOM automated valuation estimate.</p>
        </Section>
      ) : null}

      {assessment && (assessment.assessedValue !== undefined || assessment.marketValue !== undefined) ? (
        <Section title="Assessed Value" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            {assessment.assessedValue !== undefined ? (
              <Row label="Assessed" value={formatCurrency.format(assessment.assessedValue)} />
            ) : null}
            {assessment.marketValue !== undefined ? (
              <Row label="Market" value={formatCurrency.format(assessment.marketValue)} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {assessment?.taxAmount !== undefined ? (
        <Section title="Property Taxes" icon={<Receipt className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            <Row label="Annual tax" value={formatCurrency.format(assessment.taxAmount)} />
            {assessment.taxYear !== undefined ? (
              <Row label="Tax year" value={String(assessment.taxYear)} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {sales.length > 0 ? (
        <Section title="Previous Sale History" icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            {sales.map((sale, index) => (
              <div
                key={`${sale.date ?? "unknown"}-${index}`}
                className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[#66716a]">{sale.date ?? "Date unavailable"}</span>
                <span className="font-mono font-semibold text-[#111817]">
                  {sale.price !== undefined ? formatCurrency.format(sale.price) : "—"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {features && (features.beds !== undefined || features.buildingSqft !== undefined) ? (
        <Section title="Building Information" icon={<Building2 className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            {features.beds !== undefined ? <Row label="Beds" value={String(features.beds)} /> : null}
            {features.baths !== undefined ? <Row label="Baths" value={String(features.baths)} /> : null}
            {features.buildingSqft !== undefined ? (
              <Row label="Building" value={`${features.buildingSqft.toLocaleString()} sqft`} />
            ) : null}
            {features.construction ? <Row label="Construction" value={features.construction} /> : null}
          </div>
        </Section>
      ) : null}

      {attomReady ? (
        <Section title="ATTOM Property Data" icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}>
          <p className="text-xs leading-5 text-[#66716a]">
            Property intelligence sourced from ATTOM Data. Values reflect public records and
            automated estimates; confirm before any buyer recommendation.
          </p>
        </Section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ParcelIntelligence.tsx
git commit -m "feat: add ATTOM property intelligence panel sections"
```

---

## Task 8: Wire enrichment into the detail panel + app

**Files:**
- Modify: `src/components/ParcelDetailPanel.tsx`
- Modify: `src/components/TonyvilleApp.tsx`

- [ ] **Step 1: Add enrichment props + imports to `ParcelDetailPanel.tsx`**

In `src/components/ParcelDetailPanel.tsx`, update the type imports block (currently importing from `@/types/parcel`) and add the new imports. Replace:
```tsx
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";
import { formatCompatibilityRating } from "@/lib/tinyHomes";
import type { FitScoreBreakdown, ScoredParcel } from "@/types/parcel";
```
with:
```tsx
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";
import { formatCompatibilityRating } from "@/lib/tinyHomes";
import { ParcelIntelligence } from "@/components/ParcelIntelligence";
import type { EnrichmentStatus } from "@/lib/enrichmentClient";
import type { FitScoreBreakdown, ParcelEnrichment, ScoredParcel } from "@/types/parcel";
```

- [ ] **Step 2: Extend the props type**

Replace:
```tsx
type ParcelDetailPanelProps = {
  parcel?: ScoredParcel;
  saved: boolean;
  onToggleSave: (parcelId: string) => void;
};
```
with:
```tsx
type ParcelDetailPanelProps = {
  parcel?: ScoredParcel;
  saved: boolean;
  onToggleSave: (parcelId: string) => void;
  enrichment?: ParcelEnrichment;
  enrichmentStatus: EnrichmentStatus;
};
```

- [ ] **Step 3: Destructure the new props**

Replace:
```tsx
export function ParcelDetailPanel({
  parcel,
  saved,
  onToggleSave,
}: ParcelDetailPanelProps) {
```
with:
```tsx
export function ParcelDetailPanel({
  parcel,
  saved,
  onToggleSave,
  enrichment,
  enrichmentStatus,
}: ParcelDetailPanelProps) {
```

- [ ] **Step 4: Relabel the ScoreDial aria**

In `ScoreDial`, replace:
```tsx
      aria-label={`Tonyville Fit Score ${score}`}
```
with:
```tsx
      aria-label={`LandFit Score ${score}`}
```

- [ ] **Step 5: Render `<ParcelIntelligence>` after the Overview section**

In the JSX, find the closing `</DetailSection>` of the `Overview` section (the one wrapping `parcel.highlights`), immediately followed by the `Compatibility` DetailSection. Insert the intelligence block between them. Replace:
```tsx
          </DetailSection>

        <DetailSection title="Compatibility">
```
with:
```tsx
          </DetailSection>

          <ParcelIntelligence
            parcel={parcel}
            enrichment={enrichment}
            status={enrichmentStatus}
          />

        <DetailSection title="Tonyville Build Compatibility">
```

- [ ] **Step 6: Relabel the score breakdown section**

Replace:
```tsx
        <DetailSection title="Score Breakdown">
```
with:
```tsx
        <DetailSection title="LandFit Score">
```

- [ ] **Step 7: Wire the hook in `TonyvilleApp.tsx`**

In `src/components/TonyvilleApp.tsx`, add the import alongside the other `@/lib` imports:
```tsx
import { useParcelEnrichment } from "@/lib/enrichmentClient";
```

Then, after the `selectedParcel` / `selectedId` / `topScore` derivations (just before `handleFiltersChange`), add:
```tsx
  const { status: enrichmentStatus, data: enrichment } =
    useParcelEnrichment(selectedParcel);
```

- [ ] **Step 8: Pass the new props to the panel**

In `TonyvilleApp.tsx`, replace the `ParcelDetailPanel` usage:
```tsx
        <ParcelDetailPanel
          parcel={selectedParcel}
          saved={selectedParcel ? savedParcelIds.has(selectedParcel.id) : false}
          onToggleSave={toggleSaved}
        />
```
with:
```tsx
        <ParcelDetailPanel
          parcel={selectedParcel}
          saved={selectedParcel ? savedParcelIds.has(selectedParcel.id) : false}
          onToggleSave={toggleSaved}
          enrichment={enrichment}
          enrichmentStatus={enrichmentStatus}
        />
```

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (no type errors, no lint errors).

- [ ] **Step 10: Commit**

```bash
git add src/components/ParcelDetailPanel.tsx src/components/TonyvilleApp.tsx
git commit -m "feat: wire ATTOM enrichment into parcel detail panel"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all suites (format, attom, parcelService, route, enrichmentClient) green.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; `/api/parcels/enrich` appears in the route list.

- [ ] **Step 4: Live ATTOM smoke check (manual, uses the real key in `.env`)**

Start the dev server (`npm run dev`), then in another shell:
```bash
curl -s -X POST http://localhost:3000/api/parcels/enrich \
  -H 'content-type: application/json' \
  -d '{"id":"smoke-1","address":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","county":"District of Columbia","lat":38.8977,"lng":-77.0365}' | head -c 800
```
Expected: a JSON `ParcelEnrichment` with a `providers` array. If ATTOM returns data, `details`/`assessment` are populated; if the key/package does not cover the lookup, `providers[0].status` is `error`/`empty` and the object still returns cleanly (graceful degradation). If fields come back empty for known-good addresses, adjust the ATTOM field paths in `mapDetails`/`mapAssessment`/`mapFeatures` to match the live response shape, re-run `npm test`, and re-verify.

- [ ] **Step 5: Verify the key is not exposed to the client**

Run: `npm run build && grep -rn "$(grep ATTOM_API_KEY .env | cut -d= -f2)" .next/static 2>/dev/null && echo "LEAK" || echo "OK: ATTOM key not in client bundle"`
Expected: `OK: ATTOM key not in client bundle`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Regrid primary (untouched) ✓; ATTOM secondary enrichment (Task 3) ✓; `regrid.ts`/`attom.ts`/`parcelService.ts` layout ✓; UI never calls ATTOM (client → proxy only, Task 6) ✓; flow search→select→enrich→update (Tasks 6/8) ✓; interfaces Parcel/ParcelDetails/Assessment/SalesHistory/Utilities(=EnrichedUtilities)/PropertyFeatures (Task 2) ✓; all 10 detail sections + LandFit rename + compatibility rename (Tasks 7/8) ✓; loading states (Task 7 skeletons) ✓; graceful hiding (Task 7) ✓; session caching server+client (Tasks 4/6) ✓; key never on frontend (Task 5 server-only + Task 9 Step 5) ✓; modular for future providers (enricher registry, Task 4) ✓; Vitest (Task 1) ✓.
- **Placeholder scan:** No TBD/TODO; every code step contains full code; the only runtime "adjust field paths" note (Task 9 Step 4) is a real verification action, not a deferred implementation.
- **Type consistency:** `EnrichmentFragment`, `ParcelEnricher`, `ParcelEnrichment`, `ProviderStatus`, `EnrichedUtilities`, `EnrichmentStatus` used consistently across Tasks 2–8; `createParcelService`/`parcelService`/`enrichParcel`/`toParcelLookup`/`fetchEnrichment`/`useParcelEnrichment`/`attomEnricher` names match every call site.
