import "server-only";
import { isWithinOfficialCoverage } from "@/lib/ingestion/coverage";
import { searchParcelsOnDemand } from "@/lib/ingestion/onDemand";
import { storedParcelToUiParcel } from "@/lib/ingestion/uiParcel";
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

/** Customer-facing copy: no raw provider/admin language in providerMessage. */
const CUSTOMER_MESSAGES = {
  showingOfficial: "Showing parcels from LA County Assessor / City Planning.",
  cached: "Using cached official records.",
  imported: "Fresh official records were imported for this area.",
  noData: "No official parcel data available for this area.",
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
      mockFallback: {
        ran: false,
        succeeded: false,
        status: "disabled-no-fabricated-data",
      },
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

  // On-demand official ingestion + cache (LA County coverage only for now).
  // Coverage is decided by coordinates, not by parsing the search label.
  const withinCoverage = isWithinOfficialCoverage(input.center);
  const onDemand = withinCoverage
    ? await searchParcelsOnDemand({
        center: { lat: input.center.lat, lng: input.center.lng },
        label: input.center.label,
        requestedBy: "land-search",
      })
    : null;
  const officialParcels = (onDemand?.parcels ?? [])
    .map(storedParcelToUiParcel)
    .filter((parcel): parcel is Parcel => parcel !== null);

  const applyRegridSteps = (
    diagnostics: ParcelSourceDiagnostics,
    fallbackTriggered: boolean,
  ) => {
    diagnostics.steps.regridRequest = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: regrid.status,
      safeError: regrid.diagnostic?.safeErrorMessage,
      fallbackTriggered,
      fallbackReason: regridFallbackReason,
    };
    diagnostics.steps.regridResponse = {
      ran: true,
      succeeded: regridRequestSucceeded,
      status: String(regrid.diagnostic?.statusCode ?? regrid.status),
      featureCount: regridFeatureCount,
      safeError: regrid.diagnostic?.safeErrorMessage,
      fallbackTriggered,
      fallbackReason: regridFallbackReason,
    };
    diagnostics.steps.regridParser = {
      ran: true,
      succeeded: regrid.status !== "error" && regrid.status !== "missing-key",
      status: regrid.status,
      featureCount: regridFeatureCount,
      parsedParcelCount: regrid.parcels.length,
      fallbackTriggered,
      fallbackReason: regridFallbackReason,
    };
  };

  const applyOnDemandSteps = (diagnostics: ParcelSourceDiagnostics) => {
    diagnostics.steps.laCountyRequest = {
      ran: Boolean(onDemand),
      succeeded: Boolean(onDemand && officialParcels.length > 0),
      status: !onDemand
        ? "skipped-outside-coverage"
        : onDemand.cacheHit
          ? "cache-hit"
          : onDemand.parcelsImported > 0
            ? "cache-miss-imported"
            : "cache-miss",
      featureCount: onDemand?.parcels.length,
      safeError: onDemand?.errors[0],
    };
    diagnostics.steps.laCountyParser = {
      ran: Boolean(onDemand),
      succeeded: Boolean(onDemand),
      status: onDemand ? "ready" : "not-run",
      featureCount: onDemand?.parcels.length,
      parsedParcelCount: officialParcels.length,
    };
  };

  if (onDemand && officialParcels.length > 0) {
    console.info(
      `[Tonyville parcels] On-demand official search served ${officialParcels.length} parcel(s) (${onDemand.cacheHit ? "cache hit" : `cache miss; imported ${onDemand.parcelsImported}`}, ${onDemand.durationMs}ms).`,
    );
    const diagnostics = makeBaseDiagnostics({
      center: input.center,
      source: "la_county_gis",
      fallbackReason: regridFallbackReason,
    });
    applyRegridSteps(diagnostics, true);
    applyOnDemandSteps(diagnostics);
    return {
      parcels: officialParcels,
      source: "la_county_gis",
      providerStatus: "ready",
      providerMessage: `${CUSTOMER_MESSAGES.showingOfficial} ${
        onDemand.cacheHit ? CUSTOMER_MESSAGES.cached : CUSTOMER_MESSAGES.imported
      }`,
      diagnostics,
    };
  }

  // No fabricated parcels, ever: the search is honestly empty.
  const detailReason = !withinCoverage
    ? `Regrid did not provide parcels (${regridFallbackReason}). This search is outside LA County coverage; no official parcel source is connected for this area yet.`
    : `Regrid did not provide parcels (${regridFallbackReason}). On-demand official search found ${onDemand?.parcels.length ?? 0} parcel(s)${onDemand?.errors.length ? ` (${onDemand.errors[0]})` : ""}.`;
  const emptySource: ParcelSearchSource = onDemand ? "la_county_gis" : "regrid";
  const diagnostics = makeBaseDiagnostics({
    center: input.center,
    source: emptySource,
    fallbackReason: detailReason,
  });
  applyRegridSteps(diagnostics, true);
  applyOnDemandSteps(diagnostics);

  const emptyStatus: ParcelProviderStatus =
    onDemand?.errors.length || regrid.status === "error"
      ? "error"
      : regrid.status === "missing-key" && !onDemand
        ? "missing-key"
        : "empty";

  return {
    parcels: [],
    source: emptySource,
    providerStatus: emptyStatus,
    providerMessage: CUSTOMER_MESSAGES.noData,
    diagnostics,
  };
}

export const parcelProviderService = {
  searchParcelCandidates,
};
