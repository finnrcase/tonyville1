import type { LatLng } from "@/lib/ingestion/model";

/**
 * Geographic coverage of the connected official parcel sources. Coverage is
 * decided by coordinates only — search labels are display text, not data.
 * When adapters for more counties come online, add their bounds here.
 */

const LA_COUNTY_BOUNDS = {
  south: 33.65,
  north: 34.9,
  west: -119.0,
  east: -117.6,
};

export function isWithinOfficialCoverage(point: LatLng): boolean {
  return (
    point.lat >= LA_COUNTY_BOUNDS.south &&
    point.lat <= LA_COUNTY_BOUNDS.north &&
    point.lng >= LA_COUNTY_BOUNDS.west &&
    point.lng <= LA_COUNTY_BOUNDS.east
  );
}
