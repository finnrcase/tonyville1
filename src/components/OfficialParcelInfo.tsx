"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import type { NormalizedParcel } from "@/lib/ingestion/model";

/**
 * Official Parcel Information for the selected parcel, served from the
 * normalized parcel database (live official source on first lookup). Every
 * value is traceable to a public dataset; anything the source does not
 * publish renders as "Not available from this source." — never estimated.
 */

type OfficialLookupResponse = {
  parcel: (NormalizedParcel & { importedAt?: string }) | null;
  origin: "store" | "live" | "none";
  persisted: boolean;
  reason: string | null;
};

const NOT_AVAILABLE = "Not available from this source.";

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#f0f2ee] py-2 first:border-t-0">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.04em] text-[#6f7b73]">
        {label}
      </dt>
      <dd
        className={`text-right text-sm ${
          value === null ? "italic text-[#9aa39d]" : "font-medium text-[#111817]"
        }`}
      >
        {value ?? NOT_AVAILABLE}
      </dd>
    </div>
  );
}

function formatLotArea(sqft: number | null): string | null {
  if (sqft === null) return null;
  const acres = sqft / 43560;
  return `${Math.round(sqft).toLocaleString()} sq ft (${acres.toFixed(2)} ac)`;
}

function formatImproved(status: "improved" | "vacant" | null): string | null {
  if (status === null) return null;
  return status === "vacant" ? "Vacant" : "Improved";
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function OfficialParcelInfo({
  lat,
  lng,
  lookupKey,
}: {
  lat: number;
  lng: number;
  lookupKey: string;
}) {
  const [settled, setSettled] = useState<{
    key: string;
    outcome:
      | { phase: "unavailable"; reason: string }
      | { phase: "ready"; data: OfficialLookupResponse };
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/parcels/official?lat=${lat}&lng=${lng}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: OfficialLookupResponse) => {
        if (controller.signal.aborted) return;
        setSettled({
          key: lookupKey,
          outcome: data.parcel
            ? { phase: "ready", data }
            : {
                phase: "unavailable",
                reason: data.reason ?? "Data unavailable",
              },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSettled({
            key: lookupKey,
            outcome: {
              phase: "unavailable",
              reason: "Official record lookup failed.",
            },
          });
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  const state:
    | { phase: "loading" }
    | { phase: "unavailable"; reason: string }
    | { phase: "ready"; data: OfficialLookupResponse } =
    settled?.key === lookupKey ? settled.outcome : { phase: "loading" };

  return (
    <section className="rounded-[24px] border border-[#e3e9e2] bg-[#fbfaf7] p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#203b2c] text-white">
          <Landmark className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[#111817]">
            Official Parcel Information
          </h3>
          <p className="text-xs text-[#6f7b73]">
            From public government datasets — no estimates
          </p>
        </div>
      </div>

      {state.phase === "loading" ? (
        <p className="mt-3 text-sm text-[#66716a]">
          Checking official records…
        </p>
      ) : null}

      {state.phase === "unavailable" ? (
        <p className="mt-3 text-sm text-[#66716a]">
          Data unavailable — {state.reason}
        </p>
      ) : null}

      {state.phase === "ready" ? (
        <>
          <dl className="mt-3">
            <FieldRow label="APN" value={state.data.parcel?.apn ?? null} />
            <FieldRow label="Address" value={state.data.parcel?.address ?? null} />
            <FieldRow
              label="Lot Area"
              value={formatLotArea(state.data.parcel?.lotAreaSqft ?? null)}
            />
            <FieldRow
              label="Jurisdiction"
              value={state.data.parcel?.jurisdiction ?? null}
            />
            <FieldRow label="County" value={state.data.parcel?.county ?? null} />
            <FieldRow label="Zoning" value={state.data.parcel?.zoning ?? null} />
            <FieldRow label="Land Use" value={state.data.parcel?.landUse ?? null} />
            <FieldRow
              label="Owner Type"
              value={state.data.parcel?.ownerType ?? null}
            />
            <FieldRow
              label="Vacant / Improved"
              value={formatImproved(state.data.parcel?.improvedStatus ?? null)}
            />
          </dl>
          <div className="mt-3 rounded-xl bg-[#f0f2ec] p-3 text-xs leading-5 text-[#56605a]">
            <div>
              <span className="font-semibold">Source dataset:</span>{" "}
              {state.data.parcel?.provenance?.apn?.datasetName ??
                state.data.parcel?.sourceDatasetId}
            </div>
            <div>
              <span className="font-semibold">Source agency:</span>{" "}
              {state.data.parcel?.sourceAgency}
            </div>
            <div>
              <span className="font-semibold">Source data updated:</span>{" "}
              {formatDate(state.data.parcel?.sourceLastUpdated) ??
                NOT_AVAILABLE}
            </div>
            {state.data.parcel?.zoning &&
            state.data.parcel.provenance?.zoning ? (
              <div>
                <span className="font-semibold">Zoning source:</span>{" "}
                {state.data.parcel.provenance.zoning.datasetName} (
                {state.data.parcel.provenance.zoning.agency})
              </div>
            ) : null}
            {state.data.parcel?.importedAt ? (
              <div>
                <span className="font-semibold">Imported:</span>{" "}
                {formatDate(state.data.parcel.importedAt)}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
