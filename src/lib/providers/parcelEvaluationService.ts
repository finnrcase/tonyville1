import "server-only";
import { attomProvider } from "@/lib/providers/attomProvider";
import { calFireProvider, type FireRiskData } from "@/lib/providers/calFireProvider";
import { regridProvider } from "@/lib/providers/regridProvider";
import { regulatoryProvider } from "@/lib/providers/regulatoryProvider";
import { topographyProvider } from "@/lib/providers/topographyProvider";
import { utilityProvider } from "@/lib/providers/utilityProvider";
import {
  cabnCompatibilityScore,
  type CABNAccessType,
  type CABNCompatibilityResult,
  type CABNFloodZone,
  type CABNParcelScoringInput,
  type CABNParcelShape,
  type CABNRiskLevel,
  type CABNZoningCompatibility,
  type ComplexityLevel,
  fireRiskToCABNRiskLevel,
} from "@/lib/scoring/cabnCompatibilityScore";
import type {
  Assessment,
  EnrichedUtilities,
  Parcel,
  ParcelDetails,
  ParcelEnrichment,
  PropertyFeatures,
  ProviderStatus,
  SalesHistory,
  ScoredParcel,
  SearchFilters,
  SoilData,
} from "@/types/parcel";

export type ProviderStatusName =
  | "ready"
  | "empty"
  | "missing-key"
  | "error"
  | "fallback"
  | "placeholder";

export type EvaluationProviderName =
  | "mapbox"
  | "regrid"
  | "laCounty"
  | "attom"
  | "calFire"
  | "topography"
  | "regulatory"
  | "utility";

export type EvaluationProviderStatus = {
  provider: EvaluationProviderName;
  status: ProviderStatusName;
  message: string;
};

export type ParcelGeometry = {
  boundaryExists?: boolean;
  geometry?: Parcel["geometry"] | unknown;
  apn?: string;
  lotAreaAcres?: number;
  lotAreaSqft?: number;
  usableAreaSqft?: number;
  parcelShape?: CABNParcelShape;
  roadFrontageFt?: number;
  access?: CABNAccessType;
  legalRoadAccess?: boolean;
  dimensionsKnown?: boolean;
  providerStatus?: EvaluationProviderStatus;
};

export type AttomPropertyData = {
  details?: ParcelDetails;
  assessment?: Assessment;
  salesHistory?: SalesHistory;
  propertyFeatures?: PropertyFeatures;
  utilities?: EnrichedUtilities;
  estimatedValue?: number;
  providers?: ProviderStatus[];
};

export type ZoningData = {
  zoningCompatibility?: CABNZoningCompatibility;
  zoningSummary?: string;
  minimumSetbacksKnown?: boolean;
  maxLotCoveragePct?: number;
  heightLimitFt?: number;
  minimumDwellingSizeSqft?: number;
  aduAllowed?: boolean;
  overlayDistricts?: string[];
  fireSeverity?: CABNRiskLevel;
  fireRisk?: FireRiskData;
  floodZone?: CABNFloodZone;
  environmentalConstraint?: CABNRiskLevel;
  historicDistrict?: boolean;
  coastalZone?: boolean;
  utilityEasements?: "none" | "minor" | "major" | "unknown";
  providerStatus?: EvaluationProviderStatus;
};

export type TopographyData = {
  slopePct?: number;
  elevationFt?: number;
  aspect?: "north" | "south" | "east" | "west" | "mixed" | "unknown";
  drainage?: "good" | "moderate" | "poor" | "unknown";
  ridgelineRisk?: CABNRiskLevel;
  cutFillComplexity?: ComplexityLevel;
  terrainDescription?: string;
  providerStatus?: EvaluationProviderStatus;
};

export type UtilityData = {
  utilitiesKnown?: boolean;
  powerAvailable?: boolean;
  waterAvailable?: boolean;
  sewerAvailable?: boolean;
  septicLikely?: boolean;
  utilityPathFeasible?: boolean;
  roadAccessConfirmed?: boolean;
  providerStatus?: EvaluationProviderStatus;
};

export type ExistingConditionsData = {
  existingBuildings?: boolean;
  drivewayExists?: boolean;
  treeClearingLikely?: boolean;
  poolPresent?: boolean;
  soil?: SoilData;
  providerStatus?: EvaluationProviderStatus;
};

export type ParcelEvaluationInput = {
  parcelId: string;
  sourceIds: {
    regridId?: string;
    attomId?: string;
    apn?: string;
  };
  geometry?: ParcelGeometry;
  attom?: AttomPropertyData;
  zoning?: ZoningData;
  topography?: TopographyData;
  utilities?: UtilityData;
  existingConditions?: ExistingConditionsData;
  userPreferences?: SearchFilters;
  fireRisk?: FireRiskData;
};

export type ParcelEvaluationResult = {
  input: ParcelEvaluationInput;
  cabnCompatibility: CABNCompatibilityResult;
  providers: EvaluationProviderStatus[];
};

function compactStatuses(
  statuses: Array<EvaluationProviderStatus | undefined>,
) {
  return statuses.filter(
    (status): status is EvaluationProviderStatus => Boolean(status),
  );
}

function toCABNInput(input: ParcelEvaluationInput): CABNParcelScoringInput {
  return {
    parcelId: input.parcelId,
    apn: input.sourceIds.apn,
    boundary: {
      exists: input.geometry?.boundaryExists,
      geometry: input.geometry?.geometry,
      lotAreaAcres:
        input.attom?.details?.lotSizeAcres ?? input.geometry?.lotAreaAcres,
      lotAreaSqft:
        input.attom?.details?.lotSizeSqft ?? input.geometry?.lotAreaSqft,
      usableAreaSqft: input.geometry?.usableAreaSqft,
      shape: input.geometry?.parcelShape,
      roadFrontageFt: input.geometry?.roadFrontageFt,
      access: input.geometry?.access,
      legalRoadAccess: input.geometry?.legalRoadAccess,
      dimensionsKnown: input.geometry?.dimensionsKnown,
    },
    physical: {
      maxFootprintSqft: undefined,
      setbacksKnown: undefined,
      foundationFeasible: undefined,
      transportationFeasible: undefined,
      craneOrTruckAccess: undefined,
      minimumRoadWidthFt: undefined,
    },
    topography: input.topography,
    regulatory: input.zoning,
    existingConditions: input.existingConditions,
    utilities: input.utilities,
    complexity: {
      permittingComplexity:
        input.zoning?.zoningCompatibility === "compatible"
          ? "Low"
          : input.zoning?.zoningCompatibility === "conditional"
            ? "Medium"
            : "Unknown",
      siteWorkComplexity: input.topography?.cutFillComplexity,
    },
  };
}

export function buildParcelEvaluationInput(input: {
  parcel: Parcel;
  enrichment?: ParcelEnrichment;
  userPreferences?: SearchFilters;
  fireRisk?: FireRiskData;
}): ParcelEvaluationInput {
  const geometry = regridProvider.getGeometry(input.parcel);
  const attom = attomProvider.toPropertyData(input.enrichment);
  const topography = topographyProvider.getTopography(input.parcel);
  const fireRisk = input.fireRisk ?? input.enrichment?.fireRisk;
  const baseZoning = regulatoryProvider.getZoning(input.parcel);
  const zoning: ZoningData = {
    ...baseZoning,
    fireRisk,
    fireSeverity: fireRisk
      ? fireRiskToCABNRiskLevel(fireRisk)
      : baseZoning.fireSeverity,
  };
  const utilities = utilityProvider.getUtilities(input.parcel, input.enrichment);
  const existingConditions = utilityProvider.getExistingConditions(
    input.parcel,
    input.enrichment,
  );
  const sourceIds = {
    ...regridProvider.getSourceIds(input.parcel),
    attomId: undefined,
  };

  return {
    parcelId: input.parcel.id,
    sourceIds,
    geometry,
    attom,
    zoning,
    topography,
    utilities,
    existingConditions,
    userPreferences: input.userPreferences,
    fireRisk,
  };
}

export function evaluateParcel(input: {
  parcel: Parcel;
  enrichment?: ParcelEnrichment;
  userPreferences?: SearchFilters;
  fireRisk?: FireRiskData;
}): ParcelEvaluationResult {
  const evaluationInput = buildParcelEvaluationInput(input);
  const cabnCompatibility = cabnCompatibilityScore(toCABNInput(evaluationInput));
  const providers = compactStatuses([
    evaluationInput.geometry?.providerStatus,
    attomProvider.providerStatus(input.enrichment),
    evaluationInput.topography?.providerStatus,
    evaluationInput.zoning?.providerStatus,
    evaluationInput.fireRisk
      ? {
          provider: "calFire",
          status: evaluationInput.fireRisk.available ? "ready" : "empty",
          message: evaluationInput.fireRisk.available
            ? "CAL FIRE wildfire screening loaded."
            : (evaluationInput.fireRisk.notes[0] ??
              "CAL FIRE wildfire data unavailable."),
        }
      : undefined,
    evaluationInput.utilities?.providerStatus,
    evaluationInput.existingConditions?.providerStatus,
  ]);

  providers
    .filter((provider) => provider.status === "error")
    .forEach((provider) => {
      console.warn(
        `[Tonyville provider:${provider.provider}] ${provider.message}`,
      );
    });

  return {
    input: evaluationInput,
    cabnCompatibility,
    providers,
  };
}

export async function evaluateParcelWithProviders(input: {
  parcel: Parcel;
  enrichment?: ParcelEnrichment;
  userPreferences?: SearchFilters;
}): Promise<ParcelEvaluationResult> {
  const fireRisk = await calFireProvider.getFireRisk({
    lat: input.parcel.lat,
    lng: input.parcel.lng,
    state: input.parcel.state,
    geometry: input.parcel.geometry,
  });

  return evaluateParcel({ ...input, fireRisk });
}

export function evaluateScoredParcels(
  parcels: ScoredParcel[],
  options: { userPreferences?: SearchFilters } = {},
): ScoredParcel[] {
  return parcels.map((parcel) => ({
    ...parcel,
    cabnCompatibility: evaluateParcel({
      parcel,
      userPreferences: options.userPreferences,
    }).cabnCompatibility,
  }));
}

export async function evaluateScoredParcelsWithProviders(
  parcels: ScoredParcel[],
  options: { userPreferences?: SearchFilters } = {},
): Promise<ScoredParcel[]> {
  return Promise.all(
    parcels.map(async (parcel) => {
      const result = await evaluateParcelWithProviders({
        parcel,
        userPreferences: options.userPreferences,
      });

      return {
        ...parcel,
        fireRisk: result.input.fireRisk,
        cabnCompatibility: result.cabnCompatibility,
      };
    }),
  );
}

export const parcelEvaluationService = {
  buildParcelEvaluationInput,
  evaluateParcel,
  evaluateParcelWithProviders,
  evaluateScoredParcels,
  evaluateScoredParcelsWithProviders,
};
