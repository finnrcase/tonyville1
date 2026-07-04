import type { StoredParcel } from "@/lib/ingestion/model";
import type { Parcel } from "@/types/parcel";

const SQFT_PER_ACRE = 43560;

/**
 * Maps a normalized parcel from the parcel database into the customer-search
 * `Parcel` shape. Honesty rules carry over: values the official source did
 * not publish stay unknown (price 0 with priceSource "unknown", utilities
 * false-and-flagged-unknown by the utility provider) — nothing is estimated.
 * Parcels without an official geometry-derived area are skipped entirely.
 */
export function storedParcelToUiParcel(stored: StoredParcel): Parcel | null {
  if (
    stored.centroidLat === null ||
    stored.centroidLng === null ||
    stored.lotAreaSqft === null ||
    stored.lotAreaSqft <= 0
  ) {
    return null;
  }

  const zoningAgency = stored.provenance.zoning?.agency;

  return {
    id: `${stored.sourceDatasetId}:${stored.sourceParcelId}`,
    provider: "la_county_gis",
    providerParcelId: stored.apn ?? stored.sourceParcelId,
    apn: stored.apn ?? undefined,
    ain: stored.ain ?? undefined,
    title: stored.apn
      ? `LA County parcel ${stored.apn}`
      : `LA County parcel ${stored.sourceParcelId}`,
    address: stored.address ?? "Situs address unavailable",
    city: stored.city ?? stored.jurisdiction ?? "Unknown",
    county: stored.county ?? "Unknown",
    state: stored.state,
    price: 0,
    acreage: stored.lotAreaSqft / SQFT_PER_ACRE,
    lat: stored.centroidLat,
    lng: stored.centroidLng,
    geometry: stored.geometry ?? undefined,
    priceSource: "unknown",
    utilities: {
      water: false,
      electricity: false,
      sewerSeptic: false,
    },
    roadAccess: {
      available: Boolean(stored.address),
      type: stored.address ? "easement" : "none",
      label: stored.address
        ? "Situs address present; legal road access requires verification"
        : "Road access unknown from official parcel data",
    },
    zoningRisk: "medium",
    permitFriendliness: "conditional",
    zoningSummary: stored.zoning
      ? `Official zoning ${stored.zoning}${zoningAgency ? ` (${zoningAgency})` : ""}. Development rules still require planning review.`
      : "Zoning is not available from the connected official sources for this parcel yet.",
    terrain: "Terrain pending USGS screening",
    parcelUse: stored.landUse ?? "Parcel",
    nearbyAmenities: [
      `Official record: ${stored.sourceAgency}`,
      stored.zoning
        ? "Official zoning attached"
        : "Zoning pending official source",
      "Normalized parcel record with per-field provenance",
    ],
    estimatedSiteWork: [
      "Confirm legal road access",
      "Verify utility connection path",
      "Confirm zoning and setbacks with the local planning agency",
    ],
    daysOnMarket: 0,
    highlights: [
      "Official parcel boundary from the LA County Assessor",
      stored.apn ? `APN ${stored.apn}` : "APN pending review",
      ...(stored.zoning ? [`Zoning ${stored.zoning}`] : []),
    ],
    constraints: [
      "Assessor records are not a listing feed; availability and price require verification",
      "Buildability must be confirmed separately",
    ],
  };
}
