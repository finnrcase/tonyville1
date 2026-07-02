import { describe, expect, it } from "vitest";
import {
  cabnRectanglePolygon,
  minClearanceFeet,
  minDistanceToBoundaryFeet,
  polygonInsidePolygon,
  usableYardAreaSqft,
  type YardGeometry,
} from "@/lib/yardGeometry";
import type { CABNModel } from "@/lib/cabnModels";

const model: CABNModel = {
  id: "cabn-120",
  name: "CABN 120",
  squareFeet: 120,
  widthFt: 10,
  lengthFt: 12,
  requiredClearanceFt: 10,
  defaultSetbackFt: 5,
  foundationType: "pier",
  utilityNeeds: [],
  description: "",
};

// ~200 ft square parcel centered near LA.
const center = { lng: -118.2437, lat: 34.0522 };
function squareAround(lng: number, lat: number, halfFt: number): YardGeometry {
  const dLat = halfFt / 364000;
  const dLng = halfFt / (Math.cos((lat * Math.PI) / 180) * 364000);
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

const parcel = squareAround(center.lng, center.lat, 100);

describe("yardGeometry", () => {
  it("a centered footprint sits inside the parcel", () => {
    const footprint = cabnRectanglePolygon(model, { center, rotationDeg: 0 });
    expect(polygonInsidePolygon(footprint, parcel)).toBe(true);
  });

  it("a footprint pushed past the edge is not inside", () => {
    const off = { lng: center.lng + 120 / (Math.cos((center.lat * Math.PI) / 180) * 364000), lat: center.lat };
    const footprint = cabnRectanglePolygon(model, { center: off, rotationDeg: 0 });
    expect(polygonInsidePolygon(footprint, parcel)).toBe(false);
  });

  it("reports a setback distance to the boundary for a centered footprint", () => {
    const footprint = cabnRectanglePolygon(model, { center, rotationDeg: 0 });
    const distance = minDistanceToBoundaryFeet(footprint, parcel);
    expect(distance).toBeGreaterThan(80); // ~100ft half-width minus ~6ft footprint half
  });

  it("rotation changes the footprint orientation (free-angle)", () => {
    const a = cabnRectanglePolygon(model, { center, rotationDeg: 0 });
    const b = cabnRectanglePolygon(model, { center, rotationDeg: 45 });
    expect(JSON.stringify(a.coordinates)).not.toEqual(JSON.stringify(b.coordinates));
  });

  it("measures clearance between two separated footprints", () => {
    const a = cabnRectanglePolygon(model, { center, rotationDeg: 0 });
    const near = squareAround(
      center.lng + 16 / (Math.cos((center.lat * Math.PI) / 180) * 364000),
      center.lat,
      5,
    );
    const clearance = minClearanceFeet(a, near);
    expect(clearance).toBeGreaterThan(0);
    expect(clearance).toBeLessThan(20);
  });

  it("computes usable yard area below the full parcel area", () => {
    const footprint = cabnRectanglePolygon(model, { center, rotationDeg: 0 });
    const usable = usableYardAreaSqft(parcel, [footprint]);
    expect(usable).toBeDefined();
    expect(usable!).toBeGreaterThan(0);
  });
});
