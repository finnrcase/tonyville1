import "server-only";
import { bboxAround } from "@/lib/ingestion/geometry";
import type {
  LatLng,
  NormalizedParcel,
  StoredParcel,
} from "@/lib/ingestion/model";
import { enrichmentAdapters, getBaseAdapter } from "@/lib/ingestion/registry";
import {
  beginRun,
  findStoredParcelAtPoint,
  finishRun,
  isIngestionWriteConfigured,
  touchDataset,
  upsertParcels,
} from "@/lib/ingestion/store";

/**
 * The ingestion pipeline: Fetcher → Parser → Normalizer → Parcel Database.
 * Adapters fetch + normalize; this module orchestrates enrichment, persists
 * normalized records, and records auditable import runs. It never fabricates
 * data and never throws raw errors — failures land on the run record.
 */

const ENRICHMENT_CONCURRENCY = 6;

async function applyEnrichment(
  parcels: NormalizedParcel[],
): Promise<{ parcels: NormalizedParcel[]; errors: string[] }> {
  const errors: string[] = [];
  const result = [...parcels];

  for (const adapter of enrichmentAdapters) {
    const targets = result
      .map((parcel, index) => ({ parcel, index }))
      .filter(({ parcel }) => adapter.appliesTo(parcel));

    for (let start = 0; start < targets.length; start += ENRICHMENT_CONCURRENCY) {
      const batch = targets.slice(start, start + ENRICHMENT_CONCURRENCY);
      const enriched = await Promise.all(
        batch.map(({ parcel }) => adapter.enrich(parcel)),
      );
      enriched.forEach((outcome, batchIndex) => {
        result[batch[batchIndex].index] = outcome.parcel;
        if (outcome.error) errors.push(outcome.error);
      });
    }
  }

  return { parcels: result, errors };
}

export type AreaImportSummary = {
  ok: boolean;
  runId: string | null;
  datasetId: string;
  status: "imported" | "failed" | "not-configured";
  rowsFetched: number;
  rowsImported: number;
  rowsFailed: number;
  durationMs: number;
  errors: string[];
  coverageArea: string;
};

export async function runAreaImport(input: {
  datasetId: string;
  center: LatLng;
  radiusMiles?: number;
  limit?: number;
  requestedBy: string;
}): Promise<AreaImportSummary> {
  const startedAt = Date.now();
  const radiusMiles = Math.min(Math.max(input.radiusMiles ?? 0.35, 0.05), 2);
  const limit = Math.min(Math.max(input.limit ?? 150, 1), 500);
  const coverageArea = `${radiusMiles} mi around ${input.center.lat.toFixed(5)}, ${input.center.lng.toFixed(5)}`;

  const adapter = getBaseAdapter(input.datasetId);
  if (!adapter) {
    return {
      ok: false,
      runId: null,
      datasetId: input.datasetId,
      status: "failed",
      rowsFetched: 0,
      rowsImported: 0,
      rowsFailed: 0,
      durationMs: Date.now() - startedAt,
      errors: [
        `No implemented adapter for dataset "${input.datasetId}". Sources without a live adapter cannot be imported.`,
      ],
      coverageArea,
    };
  }

  if (!isIngestionWriteConfigured()) {
    return {
      ok: false,
      runId: null,
      datasetId: input.datasetId,
      status: "not-configured",
      rowsFetched: 0,
      rowsImported: 0,
      rowsFailed: 0,
      durationMs: Date.now() - startedAt,
      errors: [
        "Parcel database writes are not configured (missing Supabase env or INGESTION_ADMIN_TOKEN).",
      ],
      coverageArea,
    };
  }

  const { runId, error: runError } = await beginRun({
    datasetId: input.datasetId,
    kind: "area-import",
    coverageArea,
    requestedBy: input.requestedBy,
  });
  if (!runId) {
    return {
      ok: false,
      runId: null,
      datasetId: input.datasetId,
      status: "failed",
      rowsFetched: 0,
      rowsImported: 0,
      rowsFailed: 0,
      durationMs: Date.now() - startedAt,
      errors: [runError ?? "Could not record the import run."],
      coverageArea,
    };
  }

  const fetchResult = await adapter.fetchByBbox(
    bboxAround(input.center, radiusMiles),
    limit,
  );
  const { parcels, errors: enrichmentErrors } = await applyEnrichment(
    fetchResult.parcels,
  );
  const { imported, error: upsertError } = await upsertParcels(parcels);

  const errors = [
    ...fetchResult.errors,
    ...enrichmentErrors,
    ...(upsertError ? [upsertError] : []),
  ];
  const status: "imported" | "failed" =
    upsertError || (fetchResult.rowsFetched === 0 && fetchResult.errors.length)
      ? "failed"
      : "imported";

  await touchDataset({
    datasetId: input.datasetId,
    version: fetchResult.datasetVersion,
    sourceLastUpdated: fetchResult.sourceLastUpdated,
  });
  await finishRun({
    runId,
    status,
    rowsFetched: fetchResult.rowsFetched,
    rowsImported: imported,
    rowsFailed: fetchResult.rowsFailed,
    errors,
  });

  return {
    ok: status === "imported",
    runId,
    datasetId: input.datasetId,
    status,
    rowsFetched: fetchResult.rowsFetched,
    rowsImported: imported,
    rowsFailed: fetchResult.rowsFailed,
    durationMs: Date.now() - startedAt,
    errors,
    coverageArea,
  };
}

export type ParcelLookupResult = {
  parcel: (NormalizedParcel & Partial<Pick<StoredParcel, "id" | "importedAt">>) | null;
  origin: "store" | "live" | "none";
  persisted: boolean;
  reason: string | null;
};

/**
 * Parcel Inspector lookup: prefer the normalized store; fall back to a live
 * fetch from the official source, persisting the normalized record (and an
 * auditable point-lookup run) when storage is configured.
 */
export async function lookupParcelAtPoint(
  point: LatLng,
): Promise<ParcelLookupResult> {
  const stored = await findStoredParcelAtPoint(point);
  if (stored) {
    return { parcel: stored, origin: "store", persisted: true, reason: null };
  }

  const adapter = getBaseAdapter("la-county-parcels");
  if (!adapter) {
    return {
      parcel: null,
      origin: "none",
      persisted: false,
      reason: "No live parcel source adapter is available.",
    };
  }

  const fetchResult = await adapter.fetchByPoint(point);
  if (!fetchResult.parcels.length) {
    return {
      parcel: null,
      origin: "none",
      persisted: false,
      reason:
        fetchResult.errors[0] ??
        "The official source has no parcel at this location.",
    };
  }

  const { parcels } = await applyEnrichment([fetchResult.parcels[0]]);
  const parcel = parcels[0];

  let persisted = false;
  if (isIngestionWriteConfigured()) {
    const { runId } = await beginRun({
      datasetId: adapter.dataset.id,
      kind: "point-lookup",
      coverageArea: `point ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      requestedBy: "parcel-inspector",
    });
    const { imported, error } = await upsertParcels([parcel]);
    persisted = imported > 0 && !error;
    if (runId) {
      await finishRun({
        runId,
        status: error ? "failed" : "imported",
        rowsFetched: fetchResult.rowsFetched,
        rowsImported: imported,
        rowsFailed: fetchResult.rowsFailed,
        errors: error ? [error] : [],
      });
    }
    await touchDataset({
      datasetId: adapter.dataset.id,
      version: fetchResult.datasetVersion,
      sourceLastUpdated: fetchResult.sourceLastUpdated,
    });
  }

  return { parcel, origin: "live", persisted, reason: null };
}
