import "server-only";
import { getServerEnv } from "@/lib/env";
import type { MapSearchCenter } from "@/types/parcel";

const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

type MapboxFeature = {
  place_name?: string;
  center?: [number, number];
};

type MapboxGeocodeResponse = {
  features?: MapboxFeature[];
};

export type GeocodeResult =
  | {
      status: "ready";
      center: MapSearchCenter;
      message: string;
    }
  | {
      status: "missing-key" | "empty" | "error";
      message: string;
    };

async function geocodeLocation(query: string): Promise<GeocodeResult> {
  const token = getServerEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "mapbox-geocode");
  const trimmed = query.trim();

  if (!trimmed) {
    return { status: "empty", message: "Enter a city, address, or region." };
  }

  if (!token) {
    return {
      status: "missing-key",
      message:
        "NEXT_PUBLIC_MAPBOX_TOKEN is not configured; location search is unavailable.",
    };
  }

  const url = new URL(`${MAPBOX_GEOCODING_URL}/${encodeURIComponent(trimmed)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  url.searchParams.set(
    "types",
    "address,place,locality,neighborhood,postcode,region",
  );

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      console.warn(
        `[Tonyville mapbox-geocode] Mapbox returned ${response.status} for "${trimmed}".`,
      );
      return {
        status: "error",
        message: "Mapbox could not geocode that location. Try another search.",
      };
    }

    const data = (await response.json()) as MapboxGeocodeResponse;
    const feature = data.features?.[0];
    const center = feature?.center;

    if (!center) {
      return {
        status: "empty",
        message: "No matching location found. Try a city and state.",
      };
    }

    return {
      status: "ready",
      center: {
        label: feature.place_name ?? trimmed,
        lng: center[0],
        lat: center[1],
        source: "location",
      },
      message: `Searching near ${feature.place_name ?? trimmed}.`,
    };
  } catch (error) {
    console.warn(
      `[Tonyville mapbox-geocode] Request failed for "${trimmed}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      status: "error",
      message: "Location search failed. Check the connection and try again.",
    };
  }
}

export const mapboxProvider = {
  name: "mapbox" as const,
  geocodeLocation,
};

export { geocodeLocation };
