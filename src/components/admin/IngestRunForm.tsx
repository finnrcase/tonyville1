"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

/**
 * Triggers a real area import from the LA County parcel service into the
 * normalized parcel store. Defaults to a small downtown-LA area so a first
 * run completes in seconds.
 */
export function IngestRunForm() {
  const router = useRouter();
  const [lat, setLat] = useState("34.0522");
  const [lng, setLng] = useState("-118.2437");
  const [radius, setRadius] = useState("0.25");
  const [limit, setLimit] = useState("75");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: "la-county-parcels",
          lat: Number(lat),
          lng: Number(lng),
          radiusMiles: Number(radius),
          limit: Number(limit),
        }),
      });
      const summary = (await response.json()) as {
        ok?: boolean;
        rowsImported?: number;
        rowsFetched?: number;
        durationMs?: number;
        errors?: string[];
        error?: string;
      };
      if (summary.ok) {
        setMessage(
          `Imported ${summary.rowsImported} of ${summary.rowsFetched} parcels in ${((summary.durationMs ?? 0) / 1000).toFixed(1)}s.`,
        );
      } else {
        setMessage(
          summary.error ?? summary.errors?.[0] ?? "Import failed — see run log.",
        );
      }
      router.refresh();
    } catch {
      setMessage("Import request failed.");
    } finally {
      setRunning(false);
    }
  }

  const inputClass =
    "h-9 w-24 rounded-lg border border-[#e0e4de] bg-white px-2 text-sm text-[#111817]";

  return (
    <div className="rounded-2xl border border-[#edf0ec] bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[#66716a]">
          Lat
          <input className={inputClass} value={lat} onChange={(event) => setLat(event.target.value)} />
        </label>
        <label className="text-xs text-[#66716a]">
          Lng
          <input className={inputClass} value={lng} onChange={(event) => setLng(event.target.value)} />
        </label>
        <label className="text-xs text-[#66716a]">
          Radius (mi)
          <input className={inputClass} value={radius} onChange={(event) => setRadius(event.target.value)} />
        </label>
        <label className="text-xs text-[#66716a]">
          Max parcels
          <input className={inputClass} value={limit} onChange={(event) => setLimit(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#203b2c] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          Run area import
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-[#3f4741]">{message}</p>
      ) : null}
    </div>
  );
}
