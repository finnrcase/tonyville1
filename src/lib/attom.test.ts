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
      salehistory: [{ amount: { saleamt: 280000, salerecdate: "2019-06-05" } }],
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
    const fetchMock = mockFetchSequence([
      { ok: true, json: detailResponse }, // byAddress detail
      { ok: true, json: salesResponse }, // sales history
    ]);
    const fragment = await attomEnricher.enrich(lookup);

    // The primary lookup must hit assessment/detail (superset incl. assessment).
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("/assessment/detail");

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
