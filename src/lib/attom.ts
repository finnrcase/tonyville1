import "server-only";
import type {
  Assessment,
  EnrichmentFragment,
  ParcelDetails,
  ParcelEnricher,
  ParcelLookup,
  PropertyFeatures,
  ProviderStatus,
  SalesHistory,
} from "@/types/parcel";
import { getServerEnv } from "@/lib/env";

const ATTOM_BASE_URL = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

type AttomRecord = Record<string, unknown>;

function obj(value: unknown): AttomRecord {
  return value && typeof value === "object" ? (value as AttomRecord) : {};
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function attomFetch(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<{ ok: boolean; status: number; property: AttomRecord[] }> {
  const url = new URL(`${ATTOM_BASE_URL}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { apikey: token, Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return { ok: false, status: response.status, property: [] };
  }

  const data = obj(await response.json());
  const property = Array.isArray(data.property) ? (data.property as AttomRecord[]) : [];
  return { ok: true, status: response.status, property };
}

type Strategy = {
  path: string;
  params: Record<string, string>;
};

function buildStrategies(lookup: ParcelLookup): Strategy[] {
  const strategies: Strategy[] = [];

  // `assessment/detail` returns a superset of `property/detail` for this key's
  // package: identifier, lot, summary, building AND the assessment/tax block.
  if (lookup.address && lookup.city && lookup.state) {
    strategies.push({
      path: "assessment/detail",
      params: { address1: lookup.address, address2: `${lookup.city}, ${lookup.state}` },
    });
  }

  if (lookup.apn && lookup.fips) {
    strategies.push({
      path: "assessment/detail",
      params: { apn: lookup.apn, fips: lookup.fips },
    });
  }

  // Geographic fallback when address/APN do not resolve; `property/snapshot` is
  // the only endpoint that accepts lat/long, so assessment data may be absent here.
  if (Number.isFinite(lookup.lat) && Number.isFinite(lookup.lng)) {
    strategies.push({
      path: "property/snapshot",
      params: { latitude: String(lookup.lat), longitude: String(lookup.lng), radius: "0.05" },
    });
  }

  return strategies;
}

function mapDetails(property: AttomRecord): ParcelDetails {
  const lot = obj(property.lot);
  const summary = obj(property.summary);
  return {
    propertyType: str(summary.propclass) ?? str(summary.proptype),
    lotSizeAcres: num(lot.lotsize1),
    lotSizeSqft: num(lot.lotsize2),
    yearBuilt: num(summary.yearbuilt),
    landUse: str(summary.propLandUse) ?? str(summary.propsubtype),
  };
}

function mapAssessment(property: AttomRecord): Assessment {
  const assessment = obj(property.assessment);
  const assessed = obj(assessment.assessed);
  const market = obj(assessment.market);
  const tax = obj(assessment.tax);
  return {
    assessedValue: num(assessed.assdttlvalue),
    marketValue: num(market.mktttlvalue),
    taxAmount: num(tax.taxamt),
    taxYear: num(tax.taxyear),
  };
}

function mapFeatures(property: AttomRecord): PropertyFeatures {
  const building = obj(property.building);
  const size = obj(building.size);
  const rooms = obj(building.rooms);
  const construction = obj(building.construction);
  const buildingSummary = obj(building.summary);
  const interior = obj(building.interior);
  const parking = obj(building.parking);
  return {
    beds: num(rooms.beds),
    baths: num(rooms.bathstotal),
    buildingSqft: num(size.livingsize) ?? num(size.universalsize) ?? num(size.bldgsize),
    stories: num(buildingSummary.levels),
    construction: str(construction.constructiontype),
    heating: str(interior.heating),
    cooling: str(interior.cooling),
    garage: str(parking.garagetype),
  };
}

function hasAnyValue(record: Record<string, unknown>): boolean {
  return Object.values(record).some((value) => value !== undefined);
}

async function fetchSalesHistory(
  attomId: string,
  token: string,
): Promise<SalesHistory | undefined> {
  try {
    const result = await attomFetch("saleshistory/detail", { attomid: attomId }, token);
    const property = result.property[0];
    if (!property) return undefined;

    const history = Array.isArray(property.salehistory)
      ? (property.salehistory as AttomRecord[])
      : [];
    const records = history
      .map((entry) => {
        const amount = obj(entry.amount);
        return {
          price: num(amount.saleamt) ?? num(obj(entry.saleamt).saleamt),
          date:
            str(amount.salerecdate) ??
            str(entry.salesearchdate) ??
            str(entry.saleTransDate),
        };
      })
      .filter((record) => record.price !== undefined || record.date !== undefined);

    return records.length > 0 ? records : undefined;
  } catch {
    return undefined;
  }
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "attom", status: state, message };
}

export const attomEnricher: ParcelEnricher = {
  name: "attom",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const token = getServerEnv("ATTOM_API_KEY", "attom");
    if (!token) {
      return { status: status("missing-key", "ATTOM_API_KEY is not configured.") };
    }

    let property: AttomRecord | undefined;
    let sawError = false;

    for (const strategy of buildStrategies(lookup)) {
      try {
        const result = await attomFetch(strategy.path, strategy.params, token);
        if (!result.ok) {
          console.warn(
            `[Tonyville attom] ${strategy.path} returned ${result.status}.`,
          );
          sawError = true;
          continue;
        }
        if (result.property[0]) {
          property = result.property[0];
          break;
        }
      } catch (error) {
        console.warn(
          `[Tonyville attom] ${strategy.path} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        sawError = true;
      }
    }

    if (!property) {
      return sawError
        ? { status: status("error", "ATTOM lookups failed for this parcel.") }
        : { status: status("empty", "ATTOM returned no match for this parcel.") };
    }

    const details = mapDetails(property);
    const assessment = mapAssessment(property);
    const propertyFeatures = mapFeatures(property);
    const estimatedValue = num(obj(obj(property.avm).amount).value);

    const attomId =
      str(obj(property.identifier).attomId) ??
      num(obj(property.identifier).attomId)?.toString();
    const salesHistory = attomId ? await fetchSalesHistory(attomId, token) : undefined;

    return {
      status: status("ready", "ATTOM property data loaded."),
      details: hasAnyValue(details) ? details : undefined,
      assessment: hasAnyValue(assessment) ? assessment : undefined,
      propertyFeatures: hasAnyValue(propertyFeatures) ? propertyFeatures : undefined,
      estimatedValue,
      salesHistory,
    };
  },
};
