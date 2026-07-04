import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/data/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";
import {
  getDataSourcesOverview,
  getRecentSearchEvents,
} from "@/lib/ingestion/store";
import type {
  DataSourceOverviewRow,
  IngestionRunSummary,
} from "@/lib/ingestion/model";
import { IngestRunForm } from "@/components/admin/IngestRunForm";

export const dynamic = "force-dynamic";

/**
 * Internal operational dashboard for the CABN data platform. Shows every
 * registered dataset with its honest availability, the latest import run,
 * and record counts. Not a customer-facing screen.
 */

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusLabel(row: DataSourceOverviewRow): {
  label: string;
  tone: "green" | "amber" | "red" | "gray" | "blue";
} {
  if (row.dataset.availability === "unavailable") {
    return { label: "No public dataset", tone: "gray" };
  }
  if (row.dataset.availability === "pending") {
    return { label: "Pending", tone: "amber" };
  }
  if (row.dataset.availability === "not-configured") {
    return { label: "Not configured", tone: "gray" };
  }
  if (!row.latestRun) {
    // Enrichment datasets (e.g. zoning) write onto parcel records during
    // base imports rather than running their own jobs.
    return row.recordCount
      ? { label: "Imported", tone: "green" }
      : { label: "Pending", tone: "amber" };
  }
  if (row.latestRun.status === "updating") return { label: "Updating", tone: "blue" };
  if (row.latestRun.status === "failed") return { label: "Failed", tone: "red" };
  if (row.latestRun.status === "imported") return { label: "Imported", tone: "green" };
  return { label: "Pending", tone: "amber" };
}

const TONE_CLASSES: Record<string, string> = {
  green: "bg-[#e7f2e9] text-[#1d5c33]",
  amber: "bg-[#fdf3df] text-[#8a6116]",
  red: "bg-[#fdeaea] text-[#a03030]",
  gray: "bg-[#eef0ec] text-[#66716a]",
  blue: "bg-[#e8f1f7] text-[#2b5f83]",
};

function StatusBadge({ row }: { row: DataSourceOverviewRow }) {
  const { label, tone } = statusLabel(row);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

function RunErrors({ run }: { run: IngestionRunSummary | null }) {
  if (!run?.errors.length) return <span className="text-[#9aa39d]">None</span>;
  return (
    <details>
      <summary className="cursor-pointer font-semibold text-[#a03030]">
        {run.errors.length} error{run.errors.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 max-w-md list-disc space-y-1 pl-4 text-xs text-[#66716a]">
        {run.errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </details>
  );
}

export default async function DataSourcesPage() {
  const isAdmin = await isCurrentUserAdmin().catch(() => false);
  const devBypass = process.env.NODE_ENV === "development";
  if (isSupabaseConfigured() && !isAdmin && !devBypass) {
    redirect("/auth/sign-in?next=/admin/data-sources");
  }

  const [overview, searchEvents] = await Promise.all([
    getDataSourcesOverview(),
    getRecentSearchEvents(30),
  ]);

  return (
    <main className="mx-auto max-w-7xl p-6 text-[#111817]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a827c]">
            CABN Data Platform
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Data Sources</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716a]">
            Every parcel attribute shown in the product traces back to one of
            these datasets. Sources without a public dataset are recorded as
            such — nothing is estimated or fabricated.
          </p>
        </div>
        <IngestRunForm />
      </div>

      {!overview.configured ? (
        <div className="mt-6 rounded-2xl border border-[#f2d9a0] bg-[#fdf3df] p-4 text-sm text-[#8a6116]">
          Parcel database is not configured (missing Supabase environment
          variables). Dataset registry shown from code; imports are disabled.
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[#edf0ec]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f2] text-xs uppercase text-[#66716a]">
            <tr>
              <th className="px-3 py-2">Dataset</th>
              <th className="px-3 py-2">Agency</th>
              <th className="px-3 py-2">Coverage</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Records</th>
              <th className="px-3 py-2">Source updated</th>
              <th className="px-3 py-2">Last import</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Rows ok / failed</th>
              <th className="px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {overview.rows.map((row) => (
              <tr key={row.dataset.id} className="border-t border-[#edf0ec] align-top">
                <td className="px-3 py-3">
                  <div className="font-semibold">{row.dataset.name}</div>
                  <a
                    href={row.dataset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block max-w-[260px] truncate text-xs text-[#2b6f83] underline"
                  >
                    {row.dataset.url}
                  </a>
                  <div className="mt-1 max-w-[280px] text-xs leading-5 text-[#9aa39d]">
                    {row.dataset.notes}
                  </div>
                </td>
                <td className="px-3 py-3 text-[#3f4741]">{row.dataset.agency}</td>
                <td className="px-3 py-3 text-[#3f4741]">{row.dataset.coverage}</td>
                <td className="px-3 py-3">
                  <StatusBadge row={row} />
                  {row.dataset.version ? (
                    <div className="mt-1 text-xs text-[#9aa39d]">
                      v: source data edited{" "}
                      {formatTimestamp(row.dataset.version).split(",")[0]}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {row.recordCount ?? "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-[#3f4741]">
                  {formatTimestamp(row.dataset.sourceLastUpdated)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-[#3f4741]">
                  {formatTimestamp(row.latestRun?.finishedAt ?? row.latestRun?.startedAt ?? null)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                  {formatDuration(row.latestRun?.durationMs ?? null)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                  {row.latestRun
                    ? `${row.latestRun.rowsImported} / ${row.latestRun.rowsFailed}`
                    : "—"}
                </td>
                <td className="px-3 py-3">
                  <RunErrors run={row.latestRun} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Search ingestion history</h2>
      <p className="mt-1 text-sm text-[#66716a]">
        Customer searches against the parcel cache — hits serve stored
        official records; misses trigger on-demand ingestion.
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#edf0ec]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f2] text-xs uppercase text-[#66716a]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Searched location</th>
              <th className="px-3 py-2">Radius</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Cache</th>
              <th className="px-3 py-2">Found</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {searchEvents.map((event) => (
              <tr key={event.id} className="border-t border-[#edf0ec]">
                <td className="whitespace-nowrap px-3 py-2">
                  {formatTimestamp(event.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {event.searchedLabel ?? "—"}
                  </div>
                  <div className="text-xs text-[#9aa39d]">
                    {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {event.radiusMiles} mi
                </td>
                <td className="px-3 py-2">{event.sourceDatasetId ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      event.cacheHit
                        ? TONE_CLASSES.green
                        : TONE_CLASSES.blue
                    }`}
                  >
                    {event.cacheHit ? "Hit" : "Miss → import"}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">{event.parcelsFound}</td>
                <td className="px-3 py-2 tabular-nums">
                  {event.parcelsImported}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatDuration(event.durationMs)}
                </td>
                <td className="px-3 py-2">
                  {event.errors.length ? (
                    <details>
                      <summary className="cursor-pointer font-semibold text-[#a03030]">
                        {event.errors.length}
                      </summary>
                      <ul className="mt-1 max-w-md list-disc space-y-1 pl-4 text-xs text-[#66716a]">
                        {event.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className="text-[#9aa39d]">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {searchEvents.length === 0 ? (
          <p className="p-4 text-sm text-[#66716a]">
            No customer search lookups recorded yet.
          </p>
        ) : null}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Recent import runs</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#edf0ec]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f2] text-xs uppercase text-[#66716a]">
            <tr>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Dataset</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Coverage</th>
              <th className="px-3 py-2">Fetched</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2">Failed</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Requested by</th>
            </tr>
          </thead>
          <tbody>
            {overview.recentRuns.map((run) => (
              <tr key={run.id} className="border-t border-[#edf0ec]">
                <td className="whitespace-nowrap px-3 py-2">
                  {formatTimestamp(run.startedAt)}
                </td>
                <td className="px-3 py-2">{run.datasetId}</td>
                <td className="px-3 py-2">{run.kind}</td>
                <td className="px-3 py-2 capitalize">{run.status}</td>
                <td className="px-3 py-2">{run.coverageArea ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{run.rowsFetched}</td>
                <td className="px-3 py-2 tabular-nums">{run.rowsImported}</td>
                <td className="px-3 py-2 tabular-nums">{run.rowsFailed}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatDuration(run.durationMs)}
                </td>
                <td className="px-3 py-2">{run.requestedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {overview.recentRuns.length === 0 ? (
          <p className="p-4 text-sm text-[#66716a]">
            No import runs yet. Use “Run area import” to ingest real parcels
            from an official source.
          </p>
        ) : null}
      </div>
    </main>
  );
}
