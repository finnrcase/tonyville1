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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/parcels/enrich",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchEnrichment(toParcelLookup(parcel))).rejects.toThrow();
  });
});
