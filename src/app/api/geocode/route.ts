import { NextRequest, NextResponse } from "next/server";
import { mapboxProvider } from "@/lib/providers/mapboxProvider";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const result = await mapboxProvider.geocodeLocation(query);
  const status = result.status === "ready" ? 200 : result.status === "empty" ? 404 : 503;

  return NextResponse.json(result, { status });
}
