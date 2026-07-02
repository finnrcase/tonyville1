import type { CABNCompatibilityResult } from "@/lib/scoring/cabnCompatibilityScore";

export const TINY_HOME_MODEL_SIZES = [120, 140, 160, 200, 480] as const;

export type TinyHomeModelSize = (typeof TINY_HOME_MODEL_SIZES)[number];

export type UtilityKey = "water" | "electricity" | "sewerSeptic";

export type PermitFriendlinessFilter = "any" | "medium" | "high";

export type ZoningRisk = "low" | "medium" | "high";

export type PermitFriendliness = "friendly" | "conditional" | "challenging";

export type RoadAccessType = "paved" | "gravel" | "easement" | "none";

export type SortOption =
  | "bestMatch"
  | "lowestPrice"
  | "largestLot"
  | "closest"
  | "highestScore";

export type MapStyleMode = "streets" | "satellite";

export type CompatibilityRating =
  | "excellent"
  | "good"
  | "possible"
  | "notRecommended";

export type ParcelProviderSource = "mock" | "regrid" | "la_county_gis";

export type ParcelRawValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: ParcelRawValue | undefined }
  | ParcelRawValue[];

export type SearchFilters = {
  location: string;
  radiusMiles: number;
  maxPrice: number;
  modelSize: TinyHomeModelSize;
  utilities: Record<UtilityKey, boolean>;
  requiresRoadAccess: boolean;
  permitFriendliness: PermitFriendlinessFilter;
};

export type Parcel = {
  id: string;
  provider: ParcelProviderSource;
  providerParcelId?: string;
  apn?: string;
  ain?: string;
  title: string;
  address: string;
  city: string;
  county: string;
  state: string;
  price: number;
  acreage: number;
  lat: number;
  lng: number;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  previewImageUrl?: string;
  priceSource: "listing" | "assessed" | "estimated" | "unknown";
  utilities: Record<UtilityKey, boolean>;
  roadAccess: {
    available: boolean;
    type: RoadAccessType;
    label: string;
  };
  zoningRisk: ZoningRisk;
  permitFriendliness: PermitFriendliness;
  zoningSummary: string;
  terrain: string;
  parcelUse: string;
  nearbyAmenities: string[];
  estimatedSiteWork: string[];
  daysOnMarket: number;
  highlights: string[];
  constraints: string[];
  raw?: ParcelRawValue;
};

export type FitScoreBreakdown = {
  price: number;
  lotSize: number;
  utilities: number;
  roadAccess: number;
  zoning: number;
  distance: number;
  terrain: number;
};

export type TonyvilleFitScore = {
  total: number;
  label: string;
  breakdown: FitScoreBreakdown;
  considerations: string[];
};

export type TinyHomeModel = {
  size: TinyHomeModelSize;
  name: string;
  minimumLotAcres: number;
  preferredLotAcres: number;
  setbackAssumption: string;
  utilityRequirements: UtilityKey[];
};

export type TinyHomeCompatibility = {
  selectedModel: TinyHomeModel;
  selectedRating: CompatibilityRating;
  summary: string;
  compatibleModels: Array<{
    model: TinyHomeModel;
    rating: CompatibilityRating;
    reason: string;
  }>;
};

export type ScoredParcel = Parcel & {
  distanceMiles: number;
  fitScore: TonyvilleFitScore;
  compatibility: TinyHomeCompatibility;
  cabnCompatibility?: CABNCompatibilityResult;
  fireRisk?: FireRiskData;
};

export type SearchCenter = {
  label: string;
  lat: number;
  lng: number;
};

export type ParcelSearchSource = "mock" | "regrid" | "la_county_gis" | "fallback";

export type ParcelProviderStatus =
  | "ready"
  | "missing-key"
  | "empty"
  | "error"
  | "fallback";

export type ParcelPipelineStepDiagnostic = {
  ran: boolean;
  succeeded: boolean;
  status: string;
  featureCount?: number;
  parsedParcelCount?: number;
  safeError?: string;
  fallbackTriggered?: boolean;
  fallbackReason?: string;
};

export type ParcelSourceDiagnostics = {
  currentSource: "Regrid" | "LA County GIS" | "Mock";
  fallbackReason?: string;
  steps: {
    locationSearch: ParcelPipelineStepDiagnostic;
    mapboxGeocode: ParcelPipelineStepDiagnostic;
    regridRequest: ParcelPipelineStepDiagnostic;
    regridResponse: ParcelPipelineStepDiagnostic;
    regridParser: ParcelPipelineStepDiagnostic;
    laCountyRequest: ParcelPipelineStepDiagnostic;
    laCountyParser: ParcelPipelineStepDiagnostic;
    mockFallback: ParcelPipelineStepDiagnostic;
  };
};

export type ParcelSearchResponse = {
  parcels: ScoredParcel[];
  center: SearchCenter;
  source: ParcelSearchSource;
  providerStatus: ParcelProviderStatus;
  providerMessage: string;
  diagnostics: ParcelSourceDiagnostics;
};

export type MapSearchCenter = SearchCenter & {
  source: "location" | "map" | "currentLocation";
};

// --- Property-intelligence enrichment (ATTOM and future providers) ---

export type ParcelLookup = {
  id: string;
  address: string;
  city: string;
  state: string;
  county: string;
  apn?: string;
  fips?: string;
  lat: number;
  lng: number;
  geometry?: Parcel["geometry"];
};

export type ParcelDetails = {
  propertyType?: string;
  lotSizeAcres?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  landUse?: string;
  legalDescription?: string;
  ownerOccupied?: boolean;
};

export type Assessment = {
  assessedValue?: number;
  marketValue?: number;
  assessmentYear?: number;
  taxAmount?: number;
  taxYear?: number;
  taxRatePct?: number;
};

export type SaleRecord = {
  date?: string;
  price?: number;
  buyer?: string;
  seller?: string;
  docType?: string;
};

export type SalesHistory = SaleRecord[];

export type EnrichedUtilities = {
  water?: boolean;
  electricity?: boolean;
  sewerSeptic?: boolean;
  gas?: boolean;
  source: "regrid" | "attom" | "inferred";
};

export type PropertyFeatures = {
  beds?: number;
  baths?: number;
  buildingSqft?: number;
  stories?: number;
  construction?: string;
  roof?: string;
  heating?: string;
  cooling?: string;
  garage?: string;
};

export type FloodRiskData = {
  available: boolean;
  floodZone?: string;
  riskLevel: "Low" | "Medium" | "High" | "Unknown";
  source: "FEMA" | "Unavailable";
  notes: string[];
};

export type FireRiskData = {
  available: boolean;
  fireZone?: "Very High" | "High" | "Moderate" | "Low" | "Unknown";
  stateResponsibilityArea?: boolean;
  localResponsibilityArea?: boolean;
  riskLevel: "Low" | "Medium" | "High" | "Extreme" | "Unknown";
  confidence: "High" | "Medium" | "Low";
  source: "CAL FIRE" | "Unavailable";
  notes: string[];
};

export type USGSTopographyData = {
  available: boolean;
  elevationFeet?: number;
  averageSlopePercent?: number;
  maxSlopePercent?: number;
  terrainClass?: "Flat" | "Gentle" | "Moderate" | "Steep" | "Extreme";
  aspect?: "North" | "South" | "East" | "West" | "Mixed";
  drainageRisk?: "Low" | "Medium" | "High" | "Unknown";
  estimatedSiteComplexity?: "Low" | "Medium" | "High" | "Unknown";
  confidence: "High" | "Medium" | "Low";
  notes: string[];
};

export type SoilData = {
  available: boolean;
  mapUnitName?: string;
  componentName?: string;
  drainageClass?:
    | "Excellent"
    | "Good"
    | "Moderate"
    | "Poor"
    | "Very Poor"
    | "Unknown";
  septicSuitability?: "Excellent" | "Good" | "Fair" | "Poor" | "Unknown";
  foundationSuitability?: "Excellent" | "Good" | "Fair" | "Poor" | "Unknown";
  shrinkSwellRisk?: "Low" | "Medium" | "High" | "Unknown";
  erosionRisk?: "Low" | "Medium" | "High" | "Unknown";
  drainageRisk?: "Low" | "Medium" | "High" | "Unknown";
  estimatedExcavationDifficulty?: "Low" | "Medium" | "High" | "Unknown";
  confidence: "High" | "Medium" | "Low";
  source: "USDA SSURGO" | "Unavailable";
  notes: string[];
};

export type LaCountyParcelData = {
  available: boolean;
  ain?: string;
  apn?: string;
  situsAddress?: string;
  situsCity?: string;
  useType?: string;
  useDescription?: string;
  landValue?: number;
  improvementValue?: number;
  legalDescription?: string;
  source: "LA County GIS" | "Unavailable";
  notes: string[];
};

export type ProviderName =
  | "attom"
  | "fema"
  | "usgs"
  | "calFire"
  | "usdaSoil"
  | "laCounty";

export type ProviderStatus = {
  name: ProviderName;
  status: "ready" | "empty" | "missing-key" | "error";
  message: string;
};

export type ParcelEnrichment = {
  parcelId: string;
  details?: ParcelDetails;
  assessment?: Assessment;
  salesHistory?: SalesHistory;
  propertyFeatures?: PropertyFeatures;
  utilities?: EnrichedUtilities;
  estimatedValue?: number;
  floodRisk?: FloodRiskData;
  fireRisk?: FireRiskData;
  topography?: USGSTopographyData;
  soil?: SoilData;
  laCountyParcel?: LaCountyParcelData;
  providers: ProviderStatus[];
};

export type EnrichmentFragment = Partial<
  Pick<
    ParcelEnrichment,
    | "details"
    | "assessment"
    | "salesHistory"
    | "propertyFeatures"
    | "utilities"
    | "estimatedValue"
    | "floodRisk"
    | "fireRisk"
    | "topography"
    | "soil"
    | "laCountyParcel"
  >
> & { status: ProviderStatus };

export type ParcelEnricher = {
  name: ProviderName;
  enrich(lookup: ParcelLookup): Promise<EnrichmentFragment>;
};
