import type {
  MapSearchCenter,
  MapStyleMode,
  SearchFilters,
  SortOption,
  TinyHomeModelSize,
} from "@/types/parcel";

type SearchParamReader = {
  get(name: string): string | null;
};

const tinyHomeSizes = [120, 140, 160, 200, 480] satisfies TinyHomeModelSize[];
const sortOptions = [
  "bestMatch",
  "lowestPrice",
  "largestLot",
  "closest",
  "highestScore",
] satisfies SortOption[];
const mapStyles = ["streets", "satellite"] satisfies MapStyleMode[];

function readNumber(
  params: SearchParamReader,
  key: string,
  fallback: number,
) {
  const rawValue = params.get(key);

  if (rawValue === null || rawValue.trim() === "") {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(
  params: SearchParamReader,
  key: string,
  fallback: boolean,
) {
  const value = params.get(key);

  if (value === "1") {
    return true;
  }

  if (value === "0") {
    return false;
  }

  return fallback;
}

export function parseSearchState(
  params: SearchParamReader,
  defaults: SearchFilters,
) {
  const modelSize = readNumber(params, "model", defaults.modelSize);
  const sort = params.get("sort") as SortOption | null;
  const style = params.get("style") as MapStyleMode | null;
  const rawLat = params.get("lat");
  const rawLng = params.get("lng");
  const lat = rawLat === null ? Number.NaN : Number(rawLat);
  const lng = rawLng === null ? Number.NaN : Number(rawLng);

  return {
    filters: {
      location: params.get("location") ?? defaults.location,
      radiusMiles: readNumber(params, "radius", defaults.radiusMiles),
      maxPrice: readNumber(params, "maxPrice", defaults.maxPrice),
      modelSize: tinyHomeSizes.includes(modelSize as TinyHomeModelSize)
        ? (modelSize as TinyHomeModelSize)
        : defaults.modelSize,
      utilities: {
        water: readBoolean(params, "water", defaults.utilities.water),
        electricity: readBoolean(
          params,
          "electricity",
          defaults.utilities.electricity,
        ),
        sewerSeptic: readBoolean(
          params,
          "sewerSeptic",
          defaults.utilities.sewerSeptic,
        ),
      },
      requiresRoadAccess: readBoolean(
        params,
        "roadAccess",
        defaults.requiresRoadAccess,
      ),
      permitFriendliness:
        params.get("permit") === "medium" || params.get("permit") === "high"
          ? (params.get("permit") as "medium" | "high")
          : defaults.permitFriendliness,
    },
    sort: sort && sortOptions.includes(sort) ? sort : "bestMatch",
    mapStyle: style && mapStyles.includes(style) ? style : "streets",
    mapSearchCenter:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? {
            label: params.get("area") ?? params.get("location") ?? "Map search area",
            lat,
            lng,
            source: "map" as const,
          }
        : undefined,
  };
}

export function createSearchParams(input: {
  filters: SearchFilters;
  sort: SortOption;
  mapStyle: MapStyleMode;
  mapSearchCenter?: MapSearchCenter;
}) {
  const params = new URLSearchParams();
  const { filters, sort, mapStyle, mapSearchCenter } = input;

  params.set("location", filters.location);
  params.set("radius", String(filters.radiusMiles));
  params.set("maxPrice", String(filters.maxPrice));
  params.set("model", String(filters.modelSize));
  params.set("water", filters.utilities.water ? "1" : "0");
  params.set("electricity", filters.utilities.electricity ? "1" : "0");
  params.set("sewerSeptic", filters.utilities.sewerSeptic ? "1" : "0");
  params.set("roadAccess", filters.requiresRoadAccess ? "1" : "0");
  params.set("permit", filters.permitFriendliness);
  params.set("sort", sort);
  params.set("style", mapStyle);

  if (mapSearchCenter) {
    params.set("lat", String(Number(mapSearchCenter.lat.toFixed(6))));
    params.set("lng", String(Number(mapSearchCenter.lng.toFixed(6))));
    params.set("area", mapSearchCenter.label);
  }

  return params;
}
