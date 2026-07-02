import { describe, expect, it } from "vitest";
import { getCabnModel } from "@/lib/cabnModels";
import { yardFitScore } from "@/lib/scoring/yardFitScore";
import { feetToLat, feetToLng, type YardGeometry } from "@/lib/yardGeometry";

const parcel: YardGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-118.245, 34.052],
      [-118.243, 34.052],
      [-118.243, 34.054],
      [-118.245, 34.054],
      [-118.245, 34.052],
    ],
  ],
};

describe("yardFitScore", () => {
  it("returns likely fits for an inside placement with complete screening data", () => {
    const result = yardFitScore({
      parcelGeometry: parcel,
      existingStructuresAvailable: true,
      existingStructures: [],
      accessPathKnown: true,
      utilityTieInLikely: true,
      model: getCabnModel("cabn-120"),
      placement: {
        center: { lng: -118.244, lat: 34.053 },
        rotationDeg: 0,
      },
    });

    expect(result.status).toBe("Likely Fits");
    expect(result.validPlacement).toBe(true);
    expect(result.confidence).toBe("High");
    expect(result.score).toBeGreaterThan(70);
  });

  it("blocks a CABN placed within 5 ft of an existing structure", () => {
    const lat = 34.053;
    const lng = -118.244;
    // Structure centered 13 ft east of the footprint center → ~3 ft clearance.
    const structureCenterLng = lng + feetToLng(13, lat);
    const halfLng = feetToLng(5, lat);
    const halfLat = feetToLat(5);
    const structure: YardGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [structureCenterLng - halfLng, lat - halfLat],
          [structureCenterLng + halfLng, lat - halfLat],
          [structureCenterLng + halfLng, lat + halfLat],
          [structureCenterLng - halfLng, lat + halfLat],
          [structureCenterLng - halfLng, lat - halfLat],
        ],
      ],
    };

    const result = yardFitScore({
      parcelGeometry: parcel,
      existingStructuresAvailable: true,
      existingStructures: [structure],
      accessPathKnown: true,
      utilityTieInLikely: true,
      model: getCabnModel("cabn-120"),
      placement: { center: { lng, lat }, rotationDeg: 0 },
    });

    expect(result.status).toBe("Does Not Fit");
    expect(result.blockers.join(" ")).toContain("within 5 ft");
  });

  it("blocks a placement outside the parcel boundary", () => {
    const result = yardFitScore({
      parcelGeometry: parcel,
      existingStructuresAvailable: true,
      existingStructures: [],
      accessPathKnown: true,
      model: getCabnModel("cabn-160"),
      placement: {
        center: { lng: -118.24, lat: 34.053 },
        rotationDeg: 0,
      },
    });

    expect(result.status).toBe("Does Not Fit");
    expect(result.validPlacement).toBe(false);
    expect(result.blockers.join(" ")).toContain("outside the parcel");
  });

  it("uses Needs Review when parcel or structure data is missing", () => {
    const result = yardFitScore({
      existingStructuresAvailable: false,
      accessPathKnown: false,
      model: getCabnModel("cabn-200"),
      placement: {
        center: { lng: -118.244, lat: 34.053 },
        rotationDeg: 0,
      },
    });

    expect(result.status).toBe("Needs Review");
    expect(result.unknowns.length).toBeGreaterThan(0);
    expect(result.unknowns.join(" ")).toContain("Parcel boundary");
    expect(result.confidence).toBe("Low");
  });
});
