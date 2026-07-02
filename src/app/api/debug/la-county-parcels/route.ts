import { NextRequest, NextResponse } from "next/server";
import { laCountyParcelProvider } from "@/lib/providers/laCountyParcelProvider";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const lat = numberParam(request.nextUrl.searchParams.get("lat"), 34.0522);
  const lng = numberParam(request.nextUrl.searchParams.get("lng"), -118.2437);
  const debug = await laCountyParcelProvider.debug({ lat, lng });

  return NextResponse.json({
    input: {
      lat,
      lng,
      coordinateOrder: "lng,lat for ArcGIS geometry parameter",
    },
    ...debug,
  });
}
