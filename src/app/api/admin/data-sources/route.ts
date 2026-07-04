import { NextResponse } from "next/server";
import { getDataSourcesOverview } from "@/lib/ingestion/store";

export const dynamic = "force-dynamic";

/** Read model for the Data Sources dashboard (dataset registry + runs + counts). */
export async function GET() {
  const overview = await getDataSourcesOverview();
  return NextResponse.json(overview);
}
