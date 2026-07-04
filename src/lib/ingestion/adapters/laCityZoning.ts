import { queryArcGisGeoJson } from "@/lib/ingestion/adapters/arcgis";
import { LA_CITY_ZONING_DATASET } from "@/lib/ingestion/datasets";
import type {
  AttributeEnrichmentAdapter,
  NormalizedParcel,
} from "@/lib/ingestion/model";

/**
 * Zoning enrichment from the City of Los Angeles official zoning polygons.
 * Applies only to parcels whose assessor jurisdiction is the City of LA;
 * parcels elsewhere keep zoning = null until their jurisdiction's zoning
 * dataset gets its own adapter. The zoning attribute carries provenance to
 * the City Planning dataset, independent of the parcel-boundary source.
 */

function isCityOfLosAngeles(parcel: NormalizedParcel): boolean {
  return parcel.jurisdiction?.trim().toLowerCase() === "los angeles";
}

export const laCityZoningAdapter: AttributeEnrichmentAdapter = {
  dataset: LA_CITY_ZONING_DATASET,

  appliesTo(parcel) {
    return (
      isCityOfLosAngeles(parcel) &&
      parcel.centroidLat !== null &&
      parcel.centroidLng !== null
    );
  },

  async enrich(parcel) {
    if (!this.appliesTo(parcel)) return { parcel };

    const result = await queryArcGisGeoJson({
      layerUrl: LA_CITY_ZONING_DATASET.url,
      geometry: {
        kind: "point",
        point: { lat: parcel.centroidLat as number, lng: parcel.centroidLng as number },
      },
      outFields: ["Zoning", "CATEGORY"],
      returnGeometry: false,
      resultRecordCount: 1,
    });

    if (result.error) {
      return {
        parcel,
        error: `Zoning lookup failed for ${parcel.sourceParcelId}: ${result.error}`,
      };
    }

    const zoning = result.features[0]?.properties?.Zoning;
    if (typeof zoning !== "string" || !zoning.trim()) {
      // The zoning layer has no polygon at this point; that is a real answer
      // ("no zoning published here"), not an error. Zoning stays null.
      return { parcel };
    }

    return {
      parcel: {
        ...parcel,
        zoning: zoning.trim(),
        provenance: {
          ...parcel.provenance,
          zoning: {
            datasetId: LA_CITY_ZONING_DATASET.id,
            datasetName: LA_CITY_ZONING_DATASET.name,
            agency: LA_CITY_ZONING_DATASET.agency,
            sourceUrl: LA_CITY_ZONING_DATASET.url,
            retrievedAt: new Date().toISOString(),
            note: "Zoning polygon intersecting the parcel centroid.",
          },
        },
      },
    };
  },
};
