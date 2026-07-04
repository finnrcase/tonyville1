import type { DatasetDescriptor } from "@/lib/ingestion/model";

/**
 * Registry of every data source the platform knows about, in the priority
 * order of the Phase 2 spec. Availability is honest: sources without a public
 * dataset are recorded as `unavailable`, never faked. These descriptors are
 * mirrored by the `ingestion_datasets` seed in supabase/migrations/0004.
 */

export const LA_COUNTY_PARCELS_DATASET: DatasetDescriptor = {
  id: "la-county-parcels",
  name: "LA County Parcels (Assessor Parcel Boundaries)",
  agency: "County of Los Angeles — eGIS / Office of the Assessor",
  url: "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0",
  coverage: "Los Angeles County, CA (~2.4M parcels)",
  availability: "live",
  notes:
    "Authoritative parcel boundaries, situs address, and assessor use codes. Queried on demand by point or bounding box.",
};

export const LA_CITY_ZONING_DATASET: DatasetDescriptor = {
  id: "la-city-zoning",
  name: "Zoning (City of Los Angeles)",
  agency: "City of Los Angeles — Department of City Planning (GeoHub)",
  url: "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15",
  coverage: "City of Los Angeles",
  availability: "live",
  notes:
    "Official zoning polygons. Used to enrich parcels whose jurisdiction is the City of Los Angeles.",
};

export const UCLA_CITYLAB_DATASET: DatasetDescriptor = {
  id: "ucla-citylab",
  name: "UCLA cityLAB",
  agency: "cityLAB — UCLA Architecture and Urban Design",
  url: "https://www.citylab.ucla.edu/",
  coverage: "Los Angeles research studies",
  availability: "unavailable",
  notes:
    "cityLAB publishes design research (Backyard Homes; Small Lots, Big Impacts) but no public parcel dataset as of 2026-07-03. Recorded honestly as unavailable; re-evaluate if a dataset is released.",
};

export const CA_STATEWIDE_PARCELS_DATASET: DatasetDescriptor = {
  id: "ca-statewide-parcels",
  name: "California Statewide Parcels",
  agency: "State of California — CA State Geoportal",
  url: "https://gis.data.ca.gov/",
  coverage: "California (statewide)",
  availability: "pending",
  notes: "Planned connector for statewide coverage beyond Los Angeles County.",
};

export const LA_COUNTY_ZONING_DATASET: DatasetDescriptor = {
  id: "la-county-zoning-unincorporated",
  name: "Zoning (LA County Unincorporated Areas)",
  agency: "LA County Department of Regional Planning",
  url: "https://planning.lacounty.gov/maps-and-gis/gis-data/",
  coverage: "Unincorporated Los Angeles County",
  availability: "pending",
  notes: "Planned zoning enrichment for parcels outside incorporated cities.",
};

export const REGRID_DATASET: DatasetDescriptor = {
  id: "regrid",
  name: "Regrid Parcel API",
  agency: "Regrid (commercial aggregator)",
  url: "https://regrid.com/",
  coverage: "United States",
  availability: "not-configured",
  notes:
    "Commercial aggregator of county parcel records. Future adapter; requires REGRID_API_KEY.",
};

export const ATTOM_DATASET: DatasetDescriptor = {
  id: "attom",
  name: "ATTOM Property API",
  agency: "ATTOM Data Solutions (commercial)",
  url: "https://www.attomdata.com/",
  coverage: "United States",
  availability: "not-configured",
  notes:
    "Commercial property data. Future adapter; requires ATTOM_API_KEY.",
};

/** Spec priority order: cityLAB, City of LA, LA County, California, commercial. */
export const ALL_DATASETS: DatasetDescriptor[] = [
  UCLA_CITYLAB_DATASET,
  LA_CITY_ZONING_DATASET,
  LA_COUNTY_PARCELS_DATASET,
  CA_STATEWIDE_PARCELS_DATASET,
  LA_COUNTY_ZONING_DATASET,
  REGRID_DATASET,
  ATTOM_DATASET,
];
