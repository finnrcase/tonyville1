import { NextResponse } from "next/server";

// Debug/diagnostic routes must not be reachable in production. Returns a 404 response
// when running in production, otherwise null (so the handler proceeds in dev/test).
export function blockDebugRouteInProduction() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}
