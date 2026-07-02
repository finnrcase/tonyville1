import { NextRequest, NextResponse } from "next/server";
import { mockParcels } from "@/lib/mockParcels";
import { lookupRegridParcelAtPoint } from "@/lib/regrid";
import {
  laCountyParcelProvider,
  shouldUseLaCountyParcelFallback,
} from "@/lib/providers/laCountyParcelProvider";
import type { Parcel, ParcelSearchSource, SearchCenter } from "@/types/parcel";

export const dynamic = "force-dynamic";

type PropertyFitResponse = {
  parcel: Parcel;
  source: ParcelSearchSource;
  sourceMessage: string;
  existingStructures: [];
  existingStructuresAvailable: boolean;
  diagnostics: {
    regridStatus: string;
    regridFeatureCount: number;
    laCountyStatus: string;
    laCountyFeatureCount: number;
    fallbackReason?: string;
  };
};

function readNumber(value: string | null) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mockParcelAt(center: SearchCenter, address: string): Parcel {
  const base = mockParcels[0];
  const delta = 0.00055;

  return {
    ...base,
    id: "mock-owned-property",
    provider: "mock",
    providerParcelId: undefined,
    apn: undefined,
    ain: undefined,
    title: "Mock property boundary",
    address,
    city: center.label.split(",")[0] || "Property",
    county: "Unknown",
    state: "Unknown",
    price: 0,
    acreage: 0.28,
    lat: center.lat,
    lng: center.lng,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [center.lng - delta, center.lat - delta],
          [center.lng + delta, center.lat - delta],
          [center.lng + delta, center.lat + delta],
          [center.lng - delta, center.lat + delta],
          [center.lng - delta, center.lat - delta],
        ],
      ],
    },
    priceSource: "unknown",
    highlights: ["Mock parcel boundary for placement tool testing"],
    constraints: [
      "Mock Data Fallback: real parcel boundary was not available.",
      "Manual parcel and setback review required.",
    ],
    raw: null,
  };
}

export async function GET(request: NextRequest) {
  const lat = readNumber(request.nextUrl.searchParams.get("lat"));
  const lng = readNumber(request.nextUrl.searchParams.get("lng"));
  const address = request.nextUrl.searchParams.get("address") ?? "Selected property";

  if (lat === undefined || lng === undefined) {
    return NextResponse.json(
      { error: "lat and lng are required for property fit lookup." },
      { status: 422 },
    );
  }

  const center: SearchCenter = {
    label: address,
    lat,
    lng,
  };

  const regrid = await lookupRegridParcelAtPoint({ lat, lng });
  const regridFeatureCount = regrid.diagnostic?.responseShape?.featureCount ?? 0;

  if (regrid.parcels[0]) {
    return NextResponse.json({
      parcel: regrid.parcels[0],
      source: "regrid",
      sourceMessage: "Regrid parcel boundary loaded for property placement.",
      existingStructures: [],
      existingStructuresAvailable: false,
      diagnostics: {
        regridStatus: regrid.status,
        regridFeatureCount,
        laCountyStatus: "not-run",
        laCountyFeatureCount: 0,
      },
    } satisfies PropertyFitResponse);
  }

  if (shouldUseLaCountyParcelFallback(center)) {
    const laCounty = await laCountyParcelProvider.lookupParcelAtPoint({ lat, lng });
    const laCountyFeatureCount = laCounty.diagnostic.featureCount ?? 0;

    if (laCounty.parcels[0]) {
      return NextResponse.json({
        parcel: laCounty.parcels[0],
        source: "la_county_gis",
        sourceMessage:
          "Using LA County GIS parcel fallback because Regrid returned no parcel boundary.",
        existingStructures: [],
        existingStructuresAvailable: false,
        diagnostics: {
          regridStatus: regrid.status,
          regridFeatureCount,
          laCountyStatus: laCounty.status,
          laCountyFeatureCount,
          fallbackReason: "Regrid point lookup returned zero parcel features.",
        },
      } satisfies PropertyFitResponse);
    }

    return NextResponse.json({
      parcel: mockParcelAt(center, address),
      source: "mock",
      sourceMessage:
        "Mock parcel fallback active because Regrid and LA County GIS returned no property boundary.",
      existingStructures: [],
      existingStructuresAvailable: false,
      diagnostics: {
        regridStatus: regrid.status,
        regridFeatureCount,
        laCountyStatus: laCounty.status,
        laCountyFeatureCount,
        fallbackReason: laCounty.message,
      },
    } satisfies PropertyFitResponse);
  }

  return NextResponse.json({
    parcel: mockParcelAt(center, address),
    source: "mock",
    sourceMessage:
      "Mock parcel fallback active because Regrid returned no boundary and LA County GIS does not cover this location.",
    existingStructures: [],
    existingStructuresAvailable: false,
    diagnostics: {
      regridStatus: regrid.status,
      regridFeatureCount,
      laCountyStatus: "skipped-outside-la-county",
      laCountyFeatureCount: 0,
      fallbackReason: "Outside LA County GIS parcel coverage.",
    },
  } satisfies PropertyFitResponse);
}
