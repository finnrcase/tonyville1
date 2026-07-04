import { describe, expect, it } from "vitest";
import type { StoredParcel } from "@/lib/ingestion/model";
import { storedParcelToUiParcel } from "@/lib/ingestion/uiParcel";

const base: StoredParcel = {
  id: "db-1",
  sourceDatasetId: "la-county-parcels",
  sourceParcelId: "5149001915",
  apn: "5149-001-915",
  ain: "5149001915",
  address: "100 W 1ST ST LOS ANGELES CA 90012",
  city: "Los Angeles",
  state: "CA",
  county: "Los Angeles",
  jurisdiction: "Los Angeles",
  centroidLat: 34.051941,
  centroidLng: -118.24451414,
  geometry: null,
  lotAreaSqft: 43560,
  zoning: "R1-1",
  landUse: "Single Family Residence",
  ownerType: null,
  improvedStatus: "improved",
  assessorUseCode: "0100",
  sourceAgency: "County of Los Angeles — eGIS / Office of the Assessor",
  sourceUrl: "https://example.test/layer",
  datasetVersion: "2023-05-16T00:00:00.000Z",
  sourceLastUpdated: "2023-05-16T00:00:00.000Z",
  provenance: {
    zoning: {
      datasetId: "la-city-zoning",
      datasetName: "Zoning (City of Los Angeles)",
      agency: "City of Los Angeles — Department of City Planning (GeoHub)",
      sourceUrl: "https://example.test/zoning",
      retrievedAt: "2026-07-03T00:00:00.000Z",
    },
  },
  raw: null,
  importedAt: "2026-07-03T00:00:00.000Z",
  lastRefreshedAt: "2026-07-03T00:00:00.000Z",
};

describe("storedParcelToUiParcel", () => {
  it("maps official values without inventing unknowns", () => {
    const parcel = storedParcelToUiParcel(base);

    expect(parcel).not.toBeNull();
    expect(parcel?.id).toBe("la-county-parcels:5149001915");
    expect(parcel?.provider).toBe("la_county_gis");
    expect(parcel?.apn).toBe("5149-001-915");
    expect(parcel?.acreage).toBeCloseTo(1);
    // Unknown values stay unknown: never an estimated price.
    expect(parcel?.price).toBe(0);
    expect(parcel?.priceSource).toBe("unknown");
    expect(parcel?.zoningSummary).toContain("R1-1");
    expect(parcel?.zoningSummary).toContain("City Planning");
  });

  it("reports missing zoning honestly", () => {
    const parcel = storedParcelToUiParcel({ ...base, zoning: null });
    expect(parcel?.zoningSummary).toMatch(/not available/i);
  });

  it("skips parcels without an official location or area", () => {
    expect(storedParcelToUiParcel({ ...base, lotAreaSqft: null })).toBeNull();
    expect(storedParcelToUiParcel({ ...base, centroidLat: null })).toBeNull();
  });
});
