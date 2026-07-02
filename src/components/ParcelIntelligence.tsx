"use client";

import type { ReactNode } from "react";
import { Building2, FileText, Landmark, Receipt, TrendingUp } from "lucide-react";
import { formatAcres, formatCurrency } from "@/lib/format";
import type { EnrichmentStatus } from "@/lib/enrichmentClient";
import type { ParcelEnrichment, ScoredParcel } from "@/types/parcel";

type ParcelIntelligenceProps = {
  parcel: ScoredParcel;
  enrichment?: ParcelEnrichment;
  status: EnrichmentStatus;
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#edf0ec] bg-white p-4 shadow-[0_8px_24px_rgba(22,24,23,0.04)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#111817]">
        {icon}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded-full bg-[#edf0ec]" />
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
      <span className="font-medium text-[#66716a]">{label}</span>
      <span className="font-mono font-semibold text-[#111817]">{value}</span>
    </div>
  );
}

export function ParcelIntelligence({ parcel, enrichment, status }: ParcelIntelligenceProps) {
  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Section title="Estimated Value" icon={<TrendingUp className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={2} />
        </Section>
        <Section title="Property Taxes" icon={<Receipt className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={3} />
        </Section>
        <Section title="Previous Sale History" icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}>
          <Skeleton lines={3} />
        </Section>
      </div>
    );
  }

  if (status === "error" || status === "idle") {
    return null;
  }

  const details = enrichment?.details;
  const assessment = enrichment?.assessment;
  const features = enrichment?.propertyFeatures;
  const sales = enrichment?.salesHistory ?? [];
  const estimatedValue = enrichment?.estimatedValue;
  const attomProvider = enrichment?.providers.find(
    (provider) => provider.name === "attom",
  );
  const attomReady = attomProvider?.status === "ready";

  const lotAcres = details?.lotSizeAcres ?? parcel.acreage;

  return (
    <div className="space-y-4">
      <Section title="Property Overview" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
        <div className="grid gap-2">
          {details?.propertyType ? <Row label="Type" value={details.propertyType} /> : null}
          {details?.landUse ? <Row label="Land use" value={details.landUse} /> : null}
          {details?.yearBuilt ? <Row label="Year built" value={String(details.yearBuilt)} /> : null}
          <Row label="County" value={`${parcel.county}, ${parcel.state}`} />
        </div>
      </Section>

      <Section title="Lot Size" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
        <div className="grid gap-2">
          <Row label="Acreage" value={formatAcres(lotAcres)} />
          {details?.lotSizeSqft ? (
            <Row label="Square feet" value={`${details.lotSizeSqft.toLocaleString()} sqft`} />
          ) : null}
        </div>
      </Section>

      {estimatedValue !== undefined ? (
        <Section title="Estimated Value" icon={<TrendingUp className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="font-mono text-2xl font-semibold text-[#203b2c]">
            {formatCurrency.format(estimatedValue)}
          </div>
          <p className="mt-1 text-xs text-[#66716a]">ATTOM automated valuation estimate.</p>
        </Section>
      ) : null}

      {assessment &&
      (assessment.assessedValue !== undefined || assessment.marketValue !== undefined) ? (
        <Section title="Assessed Value" icon={<Landmark className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            {assessment.assessedValue !== undefined ? (
              <Row label="Assessed" value={formatCurrency.format(assessment.assessedValue)} />
            ) : null}
            {assessment.marketValue !== undefined ? (
              <Row label="Market" value={formatCurrency.format(assessment.marketValue)} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {assessment?.taxAmount !== undefined ? (
        <Section title="Property Taxes" icon={<Receipt className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            <Row label="Annual tax" value={formatCurrency.format(assessment.taxAmount)} />
            {assessment.taxYear !== undefined ? (
              <Row label="Tax year" value={String(assessment.taxYear)} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {sales.length > 0 ? (
        <Section
          title="Previous Sale History"
          icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}
        >
          <div className="grid gap-2">
            {sales.map((sale, index) => (
              <div
                key={`${sale.date ?? "unknown"}-${index}`}
                className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[#66716a]">
                  {sale.date ?? "Date unavailable"}
                </span>
                <span className="font-mono font-semibold text-[#111817]">
                  {sale.price !== undefined ? formatCurrency.format(sale.price) : "—"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {features && (features.beds !== undefined || features.buildingSqft !== undefined) ? (
        <Section title="Building Information" icon={<Building2 className="h-4 w-4 text-[#2b6f83]" />}>
          <div className="grid gap-2">
            {features.beds !== undefined ? <Row label="Beds" value={String(features.beds)} /> : null}
            {features.baths !== undefined ? (
              <Row label="Baths" value={String(features.baths)} />
            ) : null}
            {features.buildingSqft !== undefined ? (
              <Row label="Building" value={`${features.buildingSqft.toLocaleString()} sqft`} />
            ) : null}
            {features.construction ? (
              <Row label="Construction" value={features.construction} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {attomReady ? (
        <Section title="ATTOM Property Data" icon={<FileText className="h-4 w-4 text-[#2b6f83]" />}>
          <p className="text-xs leading-5 text-[#66716a]">
            Property intelligence sourced from ATTOM Data. Values reflect public records and
            automated estimates; confirm before any buyer recommendation.
          </p>
        </Section>
      ) : attomProvider ? (
        <Section title="ATTOM Property Data" icon={<FileText className="h-4 w-4 text-[#8b6b2d]" />}>
          <p className="text-xs leading-5 text-[#66716a]">
            Data unavailable. {attomProvider.message}
          </p>
        </Section>
      ) : null}
    </div>
  );
}
