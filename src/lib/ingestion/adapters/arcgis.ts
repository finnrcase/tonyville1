import type { Bbox, LatLng } from "@/lib/ingestion/model";

/**
 * Minimal ArcGIS FeatureServer REST client used by the official-source
 * adapters. Only reads public layers; returns GeoJSON features plus a safe
 * error string instead of throwing, so pipeline runs can record failures.
 */

export type ArcGisGeoJsonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

export type ArcGisQueryResult = {
  features: ArcGisGeoJsonFeature[];
  exceededTransferLimit: boolean;
  error: string | null;
};

const REQUEST_TIMEOUT_MS = 25_000;

type QueryInput = {
  layerUrl: string;
  geometry: { kind: "point"; point: LatLng } | { kind: "envelope"; bbox: Bbox };
  outFields?: string[];
  returnGeometry?: boolean;
  resultRecordCount?: number;
};

export async function queryArcGisGeoJson(
  input: QueryInput,
): Promise<ArcGisQueryResult> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: input.outFields?.join(",") ?? "*",
    returnGeometry: String(input.returnGeometry ?? true),
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "geojson",
  });

  if (input.geometry.kind === "point") {
    params.set(
      "geometry",
      `${input.geometry.point.lng},${input.geometry.point.lat}`,
    );
    params.set("geometryType", "esriGeometryPoint");
  } else {
    const { west, south, east, north } = input.geometry.bbox;
    params.set("geometry", `${west},${south},${east},${north}`);
    params.set("geometryType", "esriGeometryEnvelope");
  }

  if (input.resultRecordCount) {
    params.set("resultRecordCount", String(input.resultRecordCount));
  }

  try {
    const response = await fetch(`${input.layerUrl}/query?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Official datasets change slowly; avoid hammering the public service.
      next: { revalidate: 300 },
    });
    const body = (await response.json()) as {
      features?: ArcGisGeoJsonFeature[];
      properties?: { exceededTransferLimit?: boolean };
      exceededTransferLimit?: boolean;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || body.error) {
      return {
        features: [],
        exceededTransferLimit: false,
        error:
          body.error?.message ??
          `ArcGIS query failed with HTTP ${response.status}`,
      };
    }

    return {
      features: body.features ?? [],
      exceededTransferLimit: Boolean(
        body.exceededTransferLimit ?? body.properties?.exceededTransferLimit,
      ),
      error: null,
    };
  } catch (error) {
    return {
      features: [],
      exceededTransferLimit: false,
      error: `ArcGIS query failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export type ArcGisLayerVersion = {
  /** ISO date of the layer's last data edit — used as the dataset version. */
  dataLastEdited: string | null;
};

export async function fetchArcGisLayerVersion(
  layerUrl: string,
): Promise<ArcGisLayerVersion> {
  try {
    const response = await fetch(`${layerUrl}?f=json`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    const body = (await response.json()) as {
      editingInfo?: { dataLastEditDate?: number; lastEditDate?: number };
    };
    const editedMs =
      body.editingInfo?.dataLastEditDate ?? body.editingInfo?.lastEditDate;
    return {
      dataLastEdited:
        typeof editedMs === "number" && Number.isFinite(editedMs)
          ? new Date(editedMs).toISOString()
          : null,
    };
  } catch {
    return { dataLastEdited: null };
  }
}
