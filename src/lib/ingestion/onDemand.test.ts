import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredParcel } from "@/lib/ingestion/model";

vi.mock("@/lib/ingestion/store", () => ({
  isIngestionReadConfigured: vi.fn(() => true),
  isIngestionWriteConfigured: vi.fn(() => true),
  searchFreshParcelsNear: vi.fn(async () => []),
  recordSearchEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/ingestion/pipeline", () => ({
  runAreaImport: vi.fn(),
}));

import { searchParcelsOnDemand } from "@/lib/ingestion/onDemand";
import { runAreaImport } from "@/lib/ingestion/pipeline";
import {
  isIngestionReadConfigured,
  isIngestionWriteConfigured,
  recordSearchEvent,
  searchFreshParcelsNear,
} from "@/lib/ingestion/store";

function fakeStoredParcel(id: number): StoredParcel {
  return {
    id: `db-${id}`,
    sourceDatasetId: "la-county-parcels",
    sourceParcelId: `500000${id}`,
    apn: `5000-000-${id}`,
    ain: `500000${id}`,
    address: `${id} TEST ST`,
    city: "Los Angeles",
    state: "CA",
    county: "Los Angeles",
    jurisdiction: "Los Angeles",
    centroidLat: 34.05,
    centroidLng: -118.24,
    geometry: null,
    lotAreaSqft: 5000,
    zoning: null,
    landUse: "Single",
    ownerType: null,
    improvedStatus: null,
    assessorUseCode: "0100",
    sourceAgency: "County of Los Angeles — eGIS / Office of the Assessor",
    sourceUrl: "https://example.test/layer",
    datasetVersion: null,
    sourceLastUpdated: null,
    provenance: {},
    raw: null,
    importedAt: new Date().toISOString(),
    lastRefreshedAt: new Date().toISOString(),
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => fakeStoredParcel(index));

const center = { lat: 34.05, lng: -118.24 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isIngestionReadConfigured).mockReturnValue(true);
  vi.mocked(isIngestionWriteConfigured).mockReturnValue(true);
});

describe("searchParcelsOnDemand", () => {
  it("serves the cache without importing when coverage is sufficient", async () => {
    vi.mocked(searchFreshParcelsNear).mockResolvedValueOnce(many(30));

    const result = await searchParcelsOnDemand({
      center,
      label: "Downtown LA",
      requestedBy: "test",
    });

    expect(result.cacheHit).toBe(true);
    expect(result.parcels).toHaveLength(30);
    expect(result.parcelsImported).toBe(0);
    expect(runAreaImport).not.toHaveBeenCalled();
    expect(recordSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ cacheHit: true, parcelsFound: 30 }),
    );
  });

  it("ingests from the official source when fresh coverage is insufficient", async () => {
    vi.mocked(searchFreshParcelsNear)
      .mockResolvedValueOnce(many(5))
      .mockResolvedValueOnce(many(45));
    vi.mocked(runAreaImport).mockResolvedValue({
      ok: true,
      runId: "run-1",
      datasetId: "la-county-parcels",
      status: "imported",
      rowsFetched: 45,
      rowsImported: 45,
      rowsFailed: 0,
      durationMs: 1200,
      errors: [],
      coverageArea: "test",
    });

    const result = await searchParcelsOnDemand({
      center,
      label: "New Area",
      requestedBy: "test",
    });

    expect(result.cacheHit).toBe(false);
    expect(result.parcels).toHaveLength(45);
    expect(result.parcelsImported).toBe(45);
    expect(result.runId).toBe("run-1");
    expect(runAreaImport).toHaveBeenCalledOnce();
    expect(recordSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheHit: false,
        parcelsImported: 45,
        runId: "run-1",
      }),
    );
  });

  it("serves whatever real cached parcels exist when writes are not configured", async () => {
    vi.mocked(isIngestionWriteConfigured).mockReturnValue(false);
    vi.mocked(searchFreshParcelsNear).mockResolvedValueOnce(many(5));

    const result = await searchParcelsOnDemand({
      center,
      label: "Sparse Area",
      requestedBy: "test",
    });

    expect(result.parcels).toHaveLength(5);
    expect(result.parcelsImported).toBe(0);
    expect(runAreaImport).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatch(/not configured/i);
  });

  it("returns empty without fabricating anything when the store is unavailable", async () => {
    vi.mocked(isIngestionReadConfigured).mockReturnValue(false);

    const result = await searchParcelsOnDemand({
      center,
      label: "Anywhere",
      requestedBy: "test",
    });

    expect(result.parcels).toHaveLength(0);
    expect(result.storeConfigured).toBe(false);
    expect(searchFreshParcelsNear).not.toHaveBeenCalled();
  });
});
