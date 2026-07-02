import * as turf from "@turf/turf";
import type { Feature, Geometry, LineString } from "geojson";
import type { CABNModel } from "@/lib/cabnModels";

export type LngLat = { lng: number; lat: number };

export type YardPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type YardGeometry =
  | YardPolygon
  | {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };

// Free rotation in degrees (clockwise). 0 = footprint width aligned east–west.
export type CABNPlacement = {
  center: LngLat;
  rotationDeg: number;
};

const FEET_PER_DEGREE_LAT = 364000;

function feetPerDegreeLng(lat: number) {
  return Math.max(120000, Math.cos((lat * Math.PI) / 180) * FEET_PER_DEGREE_LAT);
}

export function feetToLng(feet: number, lat: number) {
  return feet / feetPerDegreeLng(lat);
}

export function feetToLat(feet: number) {
  return feet / FEET_PER_DEGREE_LAT;
}

export function getOuterRing(geometry?: YardGeometry): [number, number][] {
  if (!geometry) return [];
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates[0]?.[0];
  return Array.isArray(ring)
    ? ring.filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          typeof point[0] === "number" &&
          typeof point[1] === "number",
      )
    : [];
}

function toFeature(geometry: YardGeometry): Feature {
  return turf.feature(geometry as Geometry);
}

function boundaryLines(geometry: YardGeometry): Feature<LineString>[] {
  const rings: number[][][] = [];
  if (geometry.type === "Polygon") {
    if (geometry.coordinates[0]) rings.push(geometry.coordinates[0]);
  } else {
    geometry.coordinates.forEach((polygon) => {
      if (polygon[0]) rings.push(polygon[0]);
    });
  }
  return rings
    .filter((ring) => Array.isArray(ring) && ring.length >= 2)
    .map((ring) => turf.lineString(ring));
}

export function centroidOfGeometry(geometry?: YardGeometry, fallback?: LngLat): LngLat {
  const fb = fallback ?? { lng: -118.2437, lat: 34.0522 };
  if (!geometry) return fb;
  try {
    const [lng, lat] = turf.centroid(toFeature(geometry)).geometry.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  } catch {
    /* fall through */
  }
  return fb;
}

export function cabnRectanglePolygon(
  model: CABNModel,
  placement: CABNPlacement,
): YardPolygon {
  const { lng, lat } = placement.center;
  const halfLng = feetToLng(model.widthFt / 2, lat);
  const halfLat = feetToLat(model.lengthFt / 2);

  const base = turf.polygon([
    [
      [lng - halfLng, lat - halfLat],
      [lng + halfLng, lat - halfLat],
      [lng + halfLng, lat + halfLat],
      [lng - halfLng, lat + halfLat],
      [lng - halfLng, lat - halfLat],
    ],
  ]);

  const rotated = placement.rotationDeg
    ? turf.transformRotate(base, placement.rotationDeg, { pivot: [lng, lat] })
    : base;

  return { type: "Polygon", coordinates: rotated.geometry.coordinates as number[][][] };
}

export function polygonInsidePolygon(inner: YardPolygon, outer?: YardGeometry): boolean {
  if (!outer) return false;
  try {
    const innerFeature = toFeature(inner);
    if (outer.type === "MultiPolygon") {
      return outer.coordinates.some((coords) =>
        turf.booleanContains(turf.polygon(coords), innerFeature),
      );
    }
    return turf.booleanContains(toFeature(outer), innerFeature);
  } catch {
    return false;
  }
}

export function polygonsIntersect(a: YardGeometry, b: YardGeometry): boolean {
  try {
    return turf.booleanIntersects(toFeature(a), toFeature(b));
  } catch {
    return false;
  }
}

// Minimum distance (feet) from the footprint to the parcel boundary. Undefined when
// geometry is missing. Use to enforce a setback buffer.
export function minDistanceToBoundaryFeet(
  inner: YardPolygon,
  outer?: YardGeometry,
): number | undefined {
  if (!outer) return undefined;
  const ring = getOuterRing(inner);
  const lines = boundaryLines(outer);
  if (!ring.length || !lines.length) return undefined;
  try {
    let min = Number.POSITIVE_INFINITY;
    for (const point of ring) {
      for (const line of lines) {
        min = Math.min(
          min,
          turf.pointToLineDistance(turf.point(point), line, { units: "feet" }),
        );
      }
    }
    return Number.isFinite(min) ? min : undefined;
  } catch {
    return undefined;
  }
}

// Minimum clearance (feet) between two footprints; 0 when they overlap.
export function minClearanceFeet(a: YardGeometry, b: YardGeometry): number {
  try {
    if (turf.booleanIntersects(toFeature(a), toFeature(b))) return 0;
    const ringA = getOuterRing(a);
    const ringB = getOuterRing(b);
    const linesA = boundaryLines(a);
    const linesB = boundaryLines(b);
    let min = Number.POSITIVE_INFINITY;
    for (const point of ringA) {
      for (const line of linesB) {
        min = Math.min(
          min,
          turf.pointToLineDistance(turf.point(point), line, { units: "feet" }),
        );
      }
    }
    for (const point of ringB) {
      for (const line of linesA) {
        min = Math.min(
          min,
          turf.pointToLineDistance(turf.point(point), line, { units: "feet" }),
        );
      }
    }
    return Number.isFinite(min) ? min : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// Usable yard area (sqft) = parcel area minus footprint and any marked structures.
export function usableYardAreaSqft(
  parcel?: YardGeometry,
  occupied: YardGeometry[] = [],
): number | undefined {
  if (!parcel) return undefined;
  try {
    const SQM_TO_SQFT = 10.7639;
    const parcelSqft = turf.area(toFeature(parcel)) * SQM_TO_SQFT;
    const occupiedSqft = occupied.reduce(
      (sum, geometry) => sum + turf.area(toFeature(geometry)) * SQM_TO_SQFT,
      0,
    );
    return Math.max(0, Math.round(parcelSqft - occupiedSqft));
  } catch {
    return undefined;
  }
}
