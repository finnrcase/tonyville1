"use client";

import { useEffect, useState } from "react";
import type { Parcel, ParcelEnrichment, ParcelLookup } from "@/types/parcel";

const sessionCache = new Map<string, ParcelEnrichment>();

export function __clearEnrichmentClientCache() {
  sessionCache.clear();
}

export function toParcelLookup(parcel: Parcel): ParcelLookup {
  return {
    id: parcel.id,
    address: parcel.address,
    city: parcel.city,
    state: parcel.state,
    county: parcel.county,
    apn: parcel.apn ?? parcel.providerParcelId,
    lat: parcel.lat,
    lng: parcel.lng,
    geometry: parcel.geometry,
  };
}

export async function fetchEnrichment(
  lookup: ParcelLookup,
  signal?: AbortSignal,
): Promise<ParcelEnrichment> {
  const cached = sessionCache.get(lookup.id);
  if (cached) return cached;

  const response = await fetch("/api/parcels/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(lookup),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Enrichment request failed: ${response.status}`);
  }

  const data = (await response.json()) as ParcelEnrichment;
  sessionCache.set(lookup.id, data);
  return data;
}

export type EnrichmentStatus = "idle" | "loading" | "ready" | "error";

export function useParcelEnrichment(parcel?: Parcel): {
  status: EnrichmentStatus;
  data?: ParcelEnrichment;
} {
  // `tick` only forces a re-render once a fetch populates the session cache;
  // status/data are derived during render so no setState happens synchronously
  // inside the effect body.
  const [, setTick] = useState(0);
  const [errorId, setErrorId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!parcel || sessionCache.has(parcel.id)) {
      return;
    }

    const controller = new AbortController();

    fetchEnrichment(toParcelLookup(parcel), controller.signal)
      .then(() => setTick((value) => value + 1))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorId(parcel.id);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id]);

  if (!parcel) {
    return { status: "idle", data: undefined };
  }

  const cached = sessionCache.get(parcel.id);
  if (cached) {
    return { status: "ready", data: cached };
  }

  if (errorId === parcel.id) {
    return { status: "error", data: undefined };
  }

  return { status: "loading", data: undefined };
}
