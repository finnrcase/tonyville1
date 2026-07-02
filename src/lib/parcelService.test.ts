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
