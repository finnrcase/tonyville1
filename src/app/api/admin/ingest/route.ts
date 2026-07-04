import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/data/profiles";
import { runAreaImport } from "@/lib/ingestion/pipeline";
import { getDatasetDescriptor } from "@/lib/ingestion/registry";

export const dynamic = "force-dynamic";

/**
 * Triggers an area import from an official source into the parcel database.
 * Authorized for signed-in admins, callers presenting the server ingestion
 * token, or local development.
 */

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const headerToken = request.headers.get("x-ingestion-token");
  if (
    headerToken &&
    process.env.INGESTION_ADMIN_TOKEN &&
    headerToken === process.env.INGESTION_ADMIN_TOKEN
  ) {
    return true;
  }
  if (process.env.NODE_ENV === "development") return true;
  try {
    return await isCurrentUserAdmin();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: {
    datasetId?: string;
    lat?: number;
    lng?: number;
    radiusMiles?: number;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const datasetId = body.datasetId ?? "la-county-parcels";
  if (!getDatasetDescriptor(datasetId)) {
    return NextResponse.json(
      { error: `Unknown dataset "${datasetId}".` },
      { status: 400 },
    );
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required numbers." },
      { status: 400 },
    );
  }

  const summary = await runAreaImport({
    datasetId,
    center: { lat, lng },
    radiusMiles: body.radiusMiles,
    limit: body.limit,
    requestedBy: "admin-dashboard",
  });

  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
