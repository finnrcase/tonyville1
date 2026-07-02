import { NextResponse } from "next/server";
import { TONYVILLE_ENV_KEYS } from "@/lib/env";
import { blockDebugRouteInProduction } from "@/lib/debugGuard";

export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = blockDebugRouteInProduction();
  if (blocked) return blocked;

  return NextResponse.json({
    env: Object.fromEntries(
      TONYVILLE_ENV_KEYS.map((key) => [
        key,
        {
          configured: Boolean(process.env[key]),
          exposure: key.startsWith("NEXT_PUBLIC_") ? "public" : "server-only",
        },
      ]),
    ),
  });
}
