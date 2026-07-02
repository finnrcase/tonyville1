import "server-only";
import { searchRegridParcels } from "@/lib/regrid";
import type { Parcel, SearchCenter, SearchFilters } from "@/types/parcel";
import type {
  EvaluationProviderStatus,
  ParcelGeometry,
} from "@/lib/providers/parcelEvaluationService";

export const regridProvider = {
  name: "regrid" as const,

  searchParcels(input: { center: SearchCenter; filters: SearchFilters }) {
    return searchRegridParcels(input);
  },

  getSourceIds(parcel: Parcel) {
    return {
      regridId: parcel.provider === "regrid" ? parcel.providerParcelId : undefined,
      apn: parcel.apn ?? parcel.providerParcelId,
    };
  },

  getGeometry(parcel: Parcel): ParcelGeometry {
    return {
      boundaryExists: Boolean(parcel.geometry),
      geometry: parcel.geometry,
      apn: parcel.apn ?? parcel.providerParcelId,
      lotAreaAcres: parcel.acreage,
      lotAreaSqft: parcel.acreage * 43560,
      parcelShape: "unknown",
      roadFrontageFt: undefined,
      access:
        !parcel.roadAccess.available || parcel.roadAccess.type === "none"
          ? "none"
          : parcel.roadAccess.type === "easement"
            ? "easement"
            : "legal",
      legalRoadAccess:
        parcel.roadAccess.type === "none"
          ? false
          : parcel.provider === "regrid"
            ? undefined
            : parcel.provider === "la_county_gis"
              ? undefined
              : parcel.roadAccess.available,
      dimensionsKnown: parcel.geometry ? undefined : false,
      providerStatus: {
        provider: parcel.provider === "la_county_gis" ? "laCounty" : "regrid",
        status:
          parcel.provider === "regrid" || parcel.provider === "la_county_gis"
            ? "ready"
            : "fallback",
        message:
          parcel.provider === "regrid"
            ? "Regrid supplied parcel identity and geometry where available."
            : parcel.provider === "la_county_gis"
              ? "LA County GIS supplied parcel identity and geometry where available."
              : "Mock parcel geometry is being used.",
      },
    };
  },

  providerStatus(parcel: Parcel): EvaluationProviderStatus {
    return {
      provider: parcel.provider === "la_county_gis" ? "laCounty" : "regrid",
      status:
        parcel.provider === "regrid" || parcel.provider === "la_county_gis"
          ? "ready"
          : "fallback",
      message:
        parcel.provider === "regrid"
          ? "Regrid parcel candidate loaded."
          : parcel.provider === "la_county_gis"
            ? "LA County GIS parcel fallback candidate loaded."
            : "Mock Data Fallback parcel loaded.",
    };
  },
};
