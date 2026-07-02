import { NextRequest, NextResponse } from "next/server";
import { debugRegrid } from "@/lib/regrid";
import { blockDebugRouteInProduction } from "@/lib/debugGuard";

export const dynamic = "force-dynamic";

function readNumber(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const blocked = blockDebugRouteInProduction();
  if (blocked) return blocked;

  const lat = readNumber(request.nextUrl.searchParams.get("lat"), 30.2672);
  const lng = readNumber(request.nextUrl.searchParams.get("lng"), -97.7431);
  const radiusMiles = Math.min(
    Math.max(readNumber(request.nextUrl.searchParams.get("radiusMiles"), 1), 0.05),
    250,
  );
  const debug = await debugRegrid({ lat, lng, radiusMiles });

  return NextResponse.json({
    env: {
      REGRID_API_KEY: {
        configured: Boolean(process.env.REGRID_API_KEY),
        exposure: "server-only",
      },
      runtime: process.env.VERCEL ? "vercel" : "local",
    },
    ...debug,
  });
}
