import { TonyvilleApp } from "@/components/TonyvilleApp";
import { logMissingEnv } from "@/lib/env";
import { defaultSearchFilters } from "@/lib/parcelSearch";
import { parseSearchState } from "@/lib/searchState";

type FindLandProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toUrlSearchParams(
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  });

  return params;
}

export default async function FindLandPage({ searchParams }: FindLandProps) {
  logMissingEnv("find-land", [
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    "REGRID_API_KEY",
    "ATTOM_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const parsed = parseSearchState(
    toUrlSearchParams(await searchParams),
    defaultSearchFilters,
  );

  return (
    <TonyvilleApp
      initialFilters={parsed.filters}
      initialSort={parsed.sort}
      initialMapStyle={parsed.mapStyle}
      initialMapSearchCenter={parsed.mapSearchCenter}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""}
    />
  );
}
