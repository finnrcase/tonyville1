import { laCityZoningAdapter } from "@/lib/ingestion/adapters/laCityZoning";
import { laCountyParcelsAdapter } from "@/lib/ingestion/adapters/laCountyParcels";
import { ALL_DATASETS } from "@/lib/ingestion/datasets";
import type {
  AttributeEnrichmentAdapter,
  DatasetDescriptor,
  ParcelBaseAdapter,
} from "@/lib/ingestion/model";

/**
 * Adding a new data source means implementing one adapter (base or
 * enrichment) and listing it here — nothing else in the application changes.
 * Sources without an implemented adapter still appear on the Data Sources
 * dashboard through `ALL_DATASETS` with their honest availability.
 */

export const parcelBaseAdapters: ParcelBaseAdapter[] = [laCountyParcelsAdapter];

export const enrichmentAdapters: AttributeEnrichmentAdapter[] = [
  laCityZoningAdapter,
];

export function getBaseAdapter(datasetId: string): ParcelBaseAdapter | null {
  return (
    parcelBaseAdapters.find((adapter) => adapter.dataset.id === datasetId) ??
    null
  );
}

export function getDatasetDescriptor(
  datasetId: string,
): DatasetDescriptor | null {
  return ALL_DATASETS.find((dataset) => dataset.id === datasetId) ?? null;
}

export { ALL_DATASETS };
