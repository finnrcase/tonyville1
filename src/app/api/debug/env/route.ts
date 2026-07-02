import { NextResponse } from "next/server";
import { TONYVILLE_ENV_KEYS } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
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
