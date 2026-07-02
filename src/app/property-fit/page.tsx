import { PropertyFitApp } from "@/components/PropertyFitApp";
import { getCabnModel } from "@/lib/cabnModels";
import { logMissingEnv } from "@/lib/env";

type PropertyFitPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PropertyFitPage({
  searchParams,
}: PropertyFitPageProps) {
  logMissingEnv("property-fit", [
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    "REGRID_API_KEY",
    "ATTOM_API_KEY",
  ]);
  const params = await searchParams;
  const model = getCabnModel(firstParam(params?.model));

  return (
    <PropertyFitApp
      initialModelId={model.id}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""}
    />
  );
}
