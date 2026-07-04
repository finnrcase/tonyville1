import { NextRequest, NextResponse } from "next/server";
import { lookupParcelAtPoint } from "@/lib/ingestion/pipeline";

export const dynamic = "force-dynamic";

/**
 * Official Parcel Information for the Parcel Inspector. Returns the
 * normalized record (store-first, live official source as fallback) with
 * per-field provenance. Fields the source does not publish are null; the
 * client renders them as "Not available from this source." Nothing is
 * estimated.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required numbers." },
      { status: 400 },
    );
  }

  const result = await lookupParcelAtPoint({ lat, lng });

  if (!result.parcel) {
    return NextResponse.json(
      {
        parcel: null,
        origin: result.origin,
        persisted: false,
        reason: result.reason ?? "Data unavailable",
      },
      { status: 200 },
    );
  }

  // The raw source payload stays server-side; the inspector shows normalized
  // fields with provenance.
  const { raw: _raw, ...parcel } = result.parcel;
  void _raw;
  return NextResponse.json({
    parcel,
    origin: result.origin,
    persisted: result.persisted,
    reason: null,
  });
}
