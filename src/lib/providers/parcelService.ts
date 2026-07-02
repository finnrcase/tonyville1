import "server-only";
import { mockParcels } from "@/lib/mockParcels";
import { laCountyParcelProvider } from "@/lib/providers/laCountyParcelProvider";
import { regridProvider } from "@/lib/providers/regridProvider";
import type {
  Parcel,
  ParcelProviderStatus,
  ParcelSearchSource,
  ParcelSourceDiagnostics,
  SearchCenter,
  SearchFilters,
} from "@/types/parcel";

export type ParcelCandidateSearchResult = {
  parcels: Parcel[];
  source: ParcelSearchSource;
  providerStatus: ParcelProviderStatus;
  providerMessage: string;
  diagnostics: ParcelSourceDiagnostics;
};

function currentSource(source: ParcelSearchSource): ParcelSourceDiagnostics["currentSource"] {
  if (source === "regrid") return "Regrid";
  if (source === "la_county_gis") return "LA County GIS";
  return "Mock";
}

function makeBaseDiagnostics(input: {
  center: SearchCenter;
  source: ParcelSearchSource;
  fallbackReason?: string;
}): ParcelSourceDiagnostics {
  const locationWasResolved = Boolean(input.center.label);
  const locationIsCoordinateDriven = input.center.label === "Map search area";

  return {
    currentSource: currentSource(input.source),
    fallbackReason: input.fallbackReason,
    steps: {
      locationSearch: {
        ran: true,
        succeeded: locationWasResolved,
        status: locationWasResolved ? "ready" : "error",
        safeError: locationWasResolved ? undefined : "No search center was resolved.",
      },
      mapboxGeocode: {
        ran: !locationIsCoordinateDriven,
        succeeded: !locationIsCoordinateDriven,
        status: locationIsCoordinateDriven
          ? "not-run-coordinate-search"
          : "ready-or-server-resolved",
        fallbackReason: locationIsCoordinateDriven
          ? "Search used map coordinates instead of Mapbox geocoding."
          : undefined,
      },
      regridRequest: { ran: false, succeeded: false, status: "not-run" },
      regridResponse: { ran: false, succeeded: false, status: "not-run" },
      regridParser: { ran: false, succeeded: false, status: "not-run" },
      laCountyRequest: { ran: false, succeeded: false, status: "not-run" },
      laCountyParser: { ran: false, succeeded: false, status: "not-run" },
      mockFallback: { ran: false, succeeded: false, status: "not-used" },
    },
  };
}

export async function searchParcelCandidates(input: {
  center: SearchCenter;
  filters: SearchFilters;
}): Promise<ParcelCandidateSearchResult> {
  const regrid = await regridProvider.searchParcels(input);
  const regridFeatureCount = regrid.diagnostic?.responseShape?.featureCount ?? 0;
  const regridRequestSucceeded = Boolean(regrid.diagnostic?.ok);
  const regridFallbackReason =
    regrid.parcels.length > 0
      ? undefined
      : regrid.status === "empty"
        ? "Regrid returned zero parcel features."
        : regrid.message;

  console.info(
    `[Tonyville parcels] center="${input.center.label}" radius=${input.filters.radiusMiles} provider=${regrid.status} returned=${regrid.parcels.length} regridStatus=${regrid.diagnostic?.statusCode ?? "n/a"} endpoint=${regrid.diagnostic?.endpoint ?? "n/a"} message="${regrid.message}"`,
  );

  if (regrid.parcels.length > 0) {
    const diagnostics = makeBaseDiagnostics({
      center: input.center,
      source: "regrid",
    });
    diagnostics.steps.regridRequest = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: regrid.status,
      safeError: regrid.diagnostic?.safeErrorMessage,
    };
    diagnostics.steps.regridResponse = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: String(regrid.diagnostic?.statusCode ?? regrid.status),
      featureCount: regridFeatureCount,
      safeError: regrid.diagnostic?.safeErrorMessage,
    };
    diagnostics.steps.regridParser = {
      ran: true,
      succeeded: true,
      status: "ready",
      featureCount: regridFeatureCount,
      parsedParcelCount: regrid.parcels.length,
      fallbackTriggered: false,
    };
    return {
      parcels: regrid.parcels,
      source: "regrid",
      providerStatus: "ready",
      providerMessage: regrid.message,
      diagnostics,
    };
  }

  const laCounty = await laCountyParcelProvider.searchParcels({
    ...input,
    regridMessage: regrid.message,
  });
  const laFallbackReason = laCounty.diagnostic.attempted
    ? undefined
    : laCounty.message;

  if (laCounty.parcels.length > 0) {
    console.info(
      `[Tonyville parcels] Regrid returned no usable parcels; LA County GIS fallback returned ${laCounty.parcels.length} parcel(s).`,
    );
    const diagnostics = makeBaseDiagnostics({
      center: input.center,
      source: "la_county_gis",
      fallbackReason: regridFallbackReason,
    });
    diagnostics.steps.regridRequest = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: regrid.status,
      safeError: regrid.diagnostic?.safeErrorMessage,
      fallbackTriggered: true,
      fallbackReason: regridFallbackReason,
    };
    diagnostics.steps.regridResponse = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: String(regrid.diagnostic?.statusCode ?? regrid.status),
      featureCount: regridFeatureCount,
      safeError: regrid.diagnostic?.safeErrorMessage,
      fallbackTriggered: true,
      fallbackReason: regridFallbackReason,
    };
    diagnostics.steps.regridParser = {
      ran: true,
      succeeded: true,
      status: regrid.status,
      featureCount: regridFeatureCount,
      parsedParcelCount: regrid.parcels.length,
      fallbackTriggered: true,
      fallbackReason: regridFallbackReason,
    };
    diagnostics.steps.laCountyRequest = {
      ran: laCounty.diagnostic.attempted,
      succeeded: laCounty.diagnostic.ok,
      status: laCounty.status,
      featureCount: laCounty.diagnostic.featureCount,
      safeError: laCounty.diagnostic.safeErrorMessage,
    };
    diagnostics.steps.laCountyParser = {
      ran: laCounty.diagnostic.attempted,
      succeeded: true,
      status: "ready",
      featureCount: laCounty.diagnostic.featureCount,
      parsedParcelCount: laCounty.parcels.length,
      fallbackTriggered: false,
    };
    return {
      parcels: laCounty.parcels,
      source: "la_county_gis",
      providerStatus: "ready",
      providerMessage: laCounty.message,
      diagnostics,
    };
  }

  if (laCounty.diagnostic.attempted && laCounty.status !== "empty") {
    console.warn(
      `[Tonyville parcels] LA County GIS fallback failed after Regrid ${regrid.status}: ${laCounty.message}`,
    );
  }

  const fallbackReason = laCounty.diagnostic.attempted
    ? `Regrid did not provide parcels (${regridFallbackReason}). LA County GIS did not provide parcels (${laCounty.message}).`
    : `Regrid did not provide parcels (${regridFallbackReason}). LA County GIS was skipped (${laFallbackReason}).`;
  const diagnostics = makeBaseDiagnostics({
    center: input.center,
    source: "mock",
    fallbackReason,
  });
  diagnostics.steps.regridRequest = {
    ran: true,
    succeeded: regridRequestSucceeded,
    status: regrid.status,
    safeError: regrid.diagnostic?.safeErrorMessage,
    fallbackTriggered: true,
    fallbackReason: regridFallbackReason,
  };
  diagnostics.steps.regridResponse = {
    ran: true,
    succeeded: regridRequestSucceeded,
    status: String(regrid.diagnostic?.statusCode ?? regrid.status),
    featureCount: regridFeatureCount,
    safeError: regrid.diagnostic?.safeErrorMessage,
    fallbackTriggered: true,
    fallbackReason: regridFallbackReason,
  };
  diagnostics.steps.regridParser = {
    ran: true,
    succeeded: regrid.status !== "error" && regrid.status !== "missing-key",
    status: regrid.status,
    featureCount: regridFeatureCount,
    parsedParcelCount: regrid.parcels.length,
    fallbackTriggered: true,
    fallbackReason: regridFallbackReason,
  };
  diagnostics.steps.laCountyRequest = {
    ran: laCounty.diagnostic.attempted,
    succeeded: laCounty.diagnostic.ok,
    status: laCounty.status,
    featureCount: laCounty.diagnostic.featureCount,
    safeError: laCounty.diagnostic.safeErrorMessage,
    fallbackTriggered: true,
    fallbackReason: laCounty.message,
  };
  diagnostics.steps.laCountyParser = {
    ran: laCounty.diagnostic.attempted,
    succeeded: laCounty.status !== "error",
    status: laCounty.status,
    featureCount: laCounty.diagnostic.featureCount,
    parsedParcelCount: laCounty.parcels.length,
    safeError: laCounty.diagnostic.safeErrorMessage,
    fallbackTriggered: true,
    fallbackReason: laCounty.message,
  };
  diagnostics.steps.mockFallback = {
    ran: true,
    succeeded: true,
    status: "ready",
    parsedParcelCount: mockParcels.length,
    fallbackTriggered: false,
    fallbackReason,
  };

  return {
    parcels: mockParcels,
    source: regrid.parcels.length > 0 ? "fallback" : "mock",
    providerStatus: regrid.parcels.length > 0 ? "fallback" : regrid.status,
    providerMessage:
      regrid.parcels.length > 0
        ? `Regrid ready returned ${regrid.parcels.length} parcel(s), but none matched the active filters. Mock Data Fallback active.`
        : laCounty.diagnostic.attempted
          ? `Regrid ${regrid.status}: ${regrid.message} LA County GIS fallback ${laCounty.status}: ${laCounty.message} Mock Data Fallback active.`
          : `Regrid ${regrid.status}: ${regrid.message}`,
    diagnostics,
  };
}

export const parcelProviderService = {
  searchParcelCandidates,
};
