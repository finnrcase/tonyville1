import { NextRequest, NextResponse } from "next/server";
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

    return NextResponse.json(
      {
        error:
          "Data unavailable: no official parcel boundary was found at this location (Regrid and LA County GIS returned nothing). No boundary is estimated.",
        diagnostics: {
          regridStatus: regrid.status,
          regridFeatureCount,
          laCountyStatus: laCounty.status,
          laCountyFeatureCount,
          fallbackReason: laCounty.message,
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      error:
        "Data unavailable: no official parcel source covers this location yet (Regrid returned no boundary; LA County GIS covers Los Angeles County only). No boundary is estimated.",
      diagnostics: {
        regridStatus: regrid.status,
        regridFeatureCount,
        laCountyStatus: "skipped-outside-la-county",
        laCountyFeatureCount: 0,
        fallbackReason: "Outside LA County GIS parcel coverage.",
      },
    },
    { status: 404 },
  );
}
