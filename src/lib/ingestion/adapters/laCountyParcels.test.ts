import { describe, expect, it } from "vitest";
import {
  deriveImprovedStatus,
  normalizeLaCountyFeature,
} from "@/lib/ingestion/adapters/laCountyParcels";
import type { ArcGisGeoJsonFeature } from "@/lib/ingestion/adapters/arcgis";

// Real attribute values captured 2026-07-03 from the LA County Parcels
// FeatureServer (point query at LA City Hall). Geometry simplified to a
// small square for the test; the service returns the true boundary.
const cityHallFeature: ArcGisGeoJsonFeature = {
  type: "Feature",
  properties: {
    AIN: "5149001915",
    APN: "5149-001-915",
    SitusFullAddress: "100 W 1ST ST LOS ANGELES CA 90012",
    SitusAddress: "100 W 1ST ST",
    SitusCity: "LOS ANGELES CA",
    SitusZIP: "90012-4112",
    TaxRateCity: "LOS ANGELES",
    AgencyName: "L A City",
    AgencyType: "LA City",
    UseCode: "8823",
    UseType: "Government",
    UseDescription: "Government Parcel",
    YearBuilt1: "2009",
    SQFTmain1: 396839,
    CENTER_LAT: 34.051941,
    CENTER_LON: -118.24451414,
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-118.245, 34.0515],
        [-118.244, 34.0515],
        [-118.244, 34.0524],
        [-118.245, 34.0524],
        [-118.245, 34.0515],
      ],
    ],
  },
};

const RETRIEVED_AT = "2026-07-03T12:00:00.000Z";
const VERSION = "2023-05-16T12:53:19.000Z";

describe("normalizeLaCountyFeature", () => {
  it("maps official assessor fields to the normalized model", () => {
    const parcel = normalizeLaCountyFeature(
      cityHallFeature,
      RETRIEVED_AT,
      VERSION,
    );

    expect(parcel).not.toBeNull();
    expect(parcel?.sourceDatasetId).toBe("la-county-parcels");
    expect(parcel?.sourceParcelId).toBe("5149001915");
    expect(parcel?.apn).toBe("5149-001-915");
    expect(parcel?.address).toBe("100 W 1ST ST LOS ANGELES CA 90012");
    expect(parcel?.city).toBe("Los Angeles");
    expect(parcel?.jurisdiction).toBe("Los Angeles");
    expect(parcel?.county).toBe("Los Angeles");
    expect(parcel?.landUse).toBe("Government Parcel");
    expect(parcel?.assessorUseCode).toBe("8823");
    expect(parcel?.ownerType).toBe("Public agency — L A City");
    expect(parcel?.improvedStatus).toBe("improved");
    expect(parcel?.centroidLat).toBeCloseTo(34.051941);
    expect(parcel?.lotAreaSqft).toBeGreaterThan(0);
    expect(parcel?.zoning).toBeNull();
    expect(parcel?.datasetVersion).toBe(VERSION);
  });

  it("stamps provenance on every populated field and none of the null ones", () => {
    const parcel = normalizeLaCountyFeature(
      cityHallFeature,
      RETRIEVED_AT,
      VERSION,
    );

    expect(parcel?.provenance.apn?.datasetId).toBe("la-county-parcels");
    expect(parcel?.provenance.apn?.retrievedAt).toBe(RETRIEVED_AT);
    expect(parcel?.provenance.lotAreaSqft?.note).toMatch(/geodesically/i);
    expect(parcel?.provenance.improvedStatus?.note).toMatch(/derived/i);
    expect(parcel?.provenance.zoning).toBeUndefined();
  });

  it("stores null instead of inventing missing values", () => {
    const bare: ArcGisGeoJsonFeature = {
      type: "Feature",
      properties: { AIN: "1234567890", SitusCity: "  " },
      geometry: null,
    };
    const parcel = normalizeLaCountyFeature(bare, RETRIEVED_AT, null);

    expect(parcel?.address).toBeNull();
    expect(parcel?.city).toBeNull();
    expect(parcel?.jurisdiction).toBeNull();
    expect(parcel?.lotAreaSqft).toBeNull();
    expect(parcel?.ownerType).toBeNull();
    expect(parcel?.improvedStatus).toBeNull();
    expect(parcel?.centroidLat).toBeNull();
    expect(parcel?.provenance.address).toBeUndefined();
  });

  it("rejects features without a stable source identifier", () => {
    const noId: ArcGisGeoJsonFeature = {
      type: "Feature",
      properties: { SitusAddress: "SOMEWHERE" },
      geometry: null,
    };
    expect(normalizeLaCountyFeature(noId, RETRIEVED_AT, null)).toBeNull();
  });
});

describe("deriveImprovedStatus", () => {
  it("classifies vacant from the assessor use description", () => {
    expect(
      deriveImprovedStatus({
        useDescription: "Vacant Land",
        useType: "Residential",
        mainSqft: null,
        yearBuilt: null,
      }),
    ).toBe("vacant");
  });

  it("classifies improved from building evidence", () => {
    expect(
      deriveImprovedStatus({
        useDescription: "Single Family Residence",
        useType: "Residential",
        mainSqft: 1450,
        yearBuilt: "1962",
      }),
    ).toBe("improved");
  });

  it("returns null when the source is silent", () => {
    expect(
      deriveImprovedStatus({
        useDescription: null,
        useType: null,
        mainSqft: null,
        yearBuilt: "0000",
      }),
    ).toBeNull();
  });
});
