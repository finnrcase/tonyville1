import type { Bbox, LatLng, ParcelGeometry } from "@/lib/ingestion/model";

const EARTH_RADIUS_METERS = 6378137;
const SQFT_PER_SQM = 10.763910417;
const MILES_TO_DEGREES_LAT = 1 / 69.0;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/**
 * Spherical-excess area of a single GeoJSON ring ([lng, lat] pairs), in
 * square meters. Same approximation used by Turf.js / the ArcGIS geodesic
 * area tools; deterministic and fully derived from the source geometry.
 */
function ringAreaSqm(ring: number[][]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    total +=
      (toRadians(lng2) - toRadians(lng1)) *
      (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

function polygonAreaSqm(rings: number[][][]): number {
  if (!rings.length) return 0;
  const [outer, ...holes] = rings;
  return holes.reduce(
    (area, hole) => area - ringAreaSqm(hole),
    ringAreaSqm(outer),
  );
}

/** Geodesic area of a parcel geometry in square feet, or null if degenerate. */
export function geodesicAreaSqft(
  geometry: ParcelGeometry | null | undefined,
): number | null {
  if (!geometry) return null;
  const sqm =
    geometry.type === "Polygon"
      ? polygonAreaSqm(geometry.coordinates as number[][][])
      : (geometry.coordinates as number[][][][]).reduce(
          (area, polygon) => area + polygonAreaSqm(polygon),
          0,
        );
  if (!Number.isFinite(sqm) || sqm <= 0) return null;
  return sqm * SQFT_PER_SQM;
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bboxAround(center: LatLng, radiusMiles: number): Bbox {
  const latDelta = radiusMiles * MILES_TO_DEGREES_LAT;
  const lngDelta =
    latDelta / Math.max(Math.cos(toRadians(center.lat)), 0.01);
  return {
    west: center.lng - lngDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    north: center.lat + latDelta,
  };
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(
  lng: number,
  lat: number,
  rings: number[][][],
): boolean {
  if (!rings.length) return false;
  const [outer, ...holes] = rings;
  if (!pointInRing(lng, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

export function pointInParcelGeometry(
  point: LatLng,
  geometry: ParcelGeometry | null | undefined,
): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygonRings(
      point.lng,
      point.lat,
      geometry.coordinates as number[][][],
    );
  }
  return (geometry.coordinates as number[][][][]).some((polygon) =>
    pointInPolygonRings(point.lng, point.lat, polygon),
  );
}

/** Vertex-average centroid; used only as a fallback when the source publishes none. */
export function approximateCentroid(
  geometry: ParcelGeometry | null | undefined,
): LatLng | null {
  if (!geometry) return null;
  const outer =
    geometry.type === "Polygon"
      ? (geometry.coordinates as number[][][])[0]
      : (geometry.coordinates as number[][][][])[0]?.[0];
  if (!outer?.length) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of outer) {
    lng += x;
    lat += y;
  }
  return { lng: lng / outer.length, lat: lat / outer.length };
}
