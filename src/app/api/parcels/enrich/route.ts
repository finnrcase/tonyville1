import { NextResponse } from "next/server";
import { logMissingEnv } from "@/lib/env";
import { parcelService } from "@/lib/parcelService";
import type { ParcelEnrichment, ParcelLookup } from "@/types/parcel";

export const dynamic = "force-dynamic";

function isValidLookup(body: unknown): body is ParcelLookup {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    b.id.length > 0 &&
    b.id.length <= 128 &&
    typeof b.address === "string" &&
    typeof b.city === "string" &&
    typeof b.state === "string" &&
    typeof b.county === "string" &&
    typeof b.lat === "number" &&
    Number.isFinite(b.lat) &&
    typeof b.lng === "number" &&
    Number.isFinite(b.lng)
  );
}

export async function POST(request: Request) {
  logMissingEnv("parcel-enrichment", ["ATTOM_API_KEY"]);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidLookup(body)) {
    return NextResponse.json({ error: "Invalid parcel lookup" }, { status: 422 });
  }

  try {
    const enrichment = await parcelService.enrichParcel(body);
    return NextResponse.json(enrichment satisfies ParcelEnrichment);
  } catch (error) {
    console.error(
      `[Tonyville enrichment] Failed for parcel ${body.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return NextResponse.json(
      { error: "Parcel enrichment failed" },
      { status: 500 },
    );
  }
}
