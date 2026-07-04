import { describe, expect, it } from "vitest";
import {
  approximateCentroid,
  bboxAround,
  geodesicAreaSqft,
  pointInParcelGeometry,
} from "@/lib/ingestion/geometry";
import type { ParcelGeometry } from "@/lib/ingestion/model";

// ~100m x ~100m square near downtown LA (34.05N). 1 deg lat ≈ 111,320 m;
// 1 deg lng ≈ 111,320 * cos(34.05) ≈ 92,225 m.
const latDelta = 100 / 111320;
const lngDelta = 100 / (111320 * Math.cos((34.05 * Math.PI) / 180));
const square: ParcelGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-118.25, 34.05],
      [-118.25 + lngDelta, 34.05],
      [-118.25 + lngDelta, 34.05 + latDelta],
      [-118.25, 34.05 + latDelta],
      [-118.25, 34.05],
    ],
  ],
};

describe("geodesicAreaSqft", () => {
  it("computes a 100m square to within 2%", () => {
    const expectedSqft = 100 * 100 * 10.7639;
    const area = geodesicAreaSqft(square);
    expect(area).not.toBeNull();
    expect(Math.abs((area as number) - expectedSqft) / expectedSqft).toBeLessThan(
      0.02,
    );
  });

  it("returns null for missing or degenerate geometry", () => {
    expect(geodesicAreaSqft(null)).toBeNull();
    expect(
      geodesicAreaSqft({ type: "Polygon", coordinates: [[]] }),
    ).toBeNull();
  });

  it("subtracts holes from the outer ring", () => {
    const withHole: ParcelGeometry = {
      type: "Polygon",
      coordinates: [
        square.coordinates[0] as number[][],
        [
          [-118.2499, 34.0501],
          [-118.2499 + lngDelta / 2, 34.0501],
          [-118.2499 + lngDelta / 2, 34.0501 + latDelta / 2],
          [-118.2499, 34.0501 + latDelta / 2],
          [-118.2499, 34.0501],
        ],
      ],
    };
    const full = geodesicAreaSqft(square) as number;
    const holed = geodesicAreaSqft(withHole) as number;
    expect(holed).toBeLessThan(full);
    expect(holed).toBeGreaterThan(full * 0.7);
  });
});

describe("pointInParcelGeometry", () => {
  it("detects inside and outside points", () => {
    const inside = {
      lat: 34.05 + latDelta / 2,
      lng: -118.25 + lngDelta / 2,
    };
    const outside = { lat: 34.06, lng: -118.26 };
    expect(pointInParcelGeometry(inside, square)).toBe(true);
    expect(pointInParcelGeometry(outside, square)).toBe(false);
    expect(pointInParcelGeometry(inside, null)).toBe(false);
  });
});

describe("bboxAround", () => {
  it("produces a bbox containing the center", () => {
    const bbox = bboxAround({ lat: 34.05, lng: -118.25 }, 0.5);
    expect(bbox.west).toBeLessThan(-118.25);
    expect(bbox.east).toBeGreaterThan(-118.25);
    expect(bbox.south).toBeLessThan(34.05);
    expect(bbox.north).toBeGreaterThan(34.05);
  });
});

describe("approximateCentroid", () => {
  it("lands inside the square", () => {
    const centroid = approximateCentroid(square);
    expect(centroid).not.toBeNull();
    expect(pointInParcelGeometry(centroid as { lat: number; lng: number }, square)).toBe(
      true,
    );
  });
});
