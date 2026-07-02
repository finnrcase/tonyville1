import { NextRequest, NextResponse } from "next/server";
import { logMissingEnv } from "@/lib/env";
import {
  defaultSearchFilters,
  resolveSearchCenter,
  scoreAndFilterParcels,
} from "@/lib/parcelSearch";
import { parcelEvaluationService } from "@/lib/providers/parcelEvaluationService";
import { parcelProviderService } from "@/lib/providers/parcelService";
import { parseSearchState } from "@/lib/searchState";
import type { MapSearchCenter, ParcelSearchResponse } from "@/types/parcel";

export const dynamic = "force-dynamic";

function getRequestCenter(request: NextRequest): MapSearchCenter {
  const params = request.nextUrl.searchParams;
  const rawLat = params.get("lat");
  const rawLng = params.get("lng");
  const lat = rawLat === null ? Number.NaN : Number(rawLat);
  const lng = rawLng === null ? Number.NaN : Number(rawLng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const label =
      params.get("area") ?? params.get("location") ?? "Map search area";
    return {
      label,
      lat,
      lng,
      source: label === "Current location" ? "currentLocation" : "map",
    };
  }

  return {
    ...resolveSearchCenter(params.get("location") ?? defaultSearchFilters.location),
    source: "location",
  };
}

export async function GET(request: NextRequest) {
  logMissingEnv("parcel-search", ["REGRID_API_KEY"]);

  const { filters } = parseSearchState(
    request.nextUrl.searchParams,
    defaultSearchFilters,
  );
  const center = getRequestCenter(request);
  const providerResult = await parcelProviderService.searchParcelCandidates({
    center,
    filters,
  });

  const parcels = await parcelEvaluationService.evaluateScoredParcelsWithProviders(
    scoreAndFilterParcels(providerResult.parcels, filters, center),
    { userPreferences: filters },
  );

  if (providerResult.source !== "mock" || parcels.length > 0) {
    const diagnostics =
      parcels.length > 0
        ? providerResult.diagnostics
        : {
            ...providerResult.diagnostics,
            fallbackReason: `${providerResult.providerMessage} Active filters removed all parsed parcels; mock fallback was not used because ${providerResult.diagnostics.currentSource} did return parcel candidates.`,
          };
    return NextResponse.json({
      parcels,
      center,
      source: providerResult.source,
      providerStatus:
        parcels.length > 0 ? providerResult.providerStatus : "empty",
      providerMessage:
        parcels.length > 0
          ? providerResult.providerMessage
          : `${providerResult.providerMessage} No parcels matched the active filters.`,
      diagnostics,
    } satisfies ParcelSearchResponse);
  }

  const fallbackCenter =
    center.source === "location"
      ? resolveSearchCenter(filters.location)
      : center;

  return NextResponse.json({
    parcels,
    center: fallbackCenter,
    source: providerResult.source,
    providerStatus: providerResult.providerStatus,
    providerMessage: providerResult.providerMessage,
    diagnostics: providerResult.diagnostics,
  } satisfies ParcelSearchResponse);
}
