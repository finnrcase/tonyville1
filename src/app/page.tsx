import { BuildCabnPlanStart } from "@/components/BuildCabnPlanStart";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  return (
    <BuildCabnPlanStart
      initialUseCase={params?.use}
    />
  );
}
