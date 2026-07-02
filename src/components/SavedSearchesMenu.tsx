"use client";
import { useCallback, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";
import {
  createSavedSearch,
  listSavedSearches,
  removeSavedSearch,
} from "@/lib/data/savedSearches";
import type { SearchFilters } from "@/types/parcel";

type SavedSearch = { id: string; filters: SearchFilters; createdAt: string };

export function SavedSearchesMenu({
  filters,
  onApply,
}: {
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
}) {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const configured = isSupabaseConfigured();

  const refresh = useCallback(() => {
    void listSavedSearches().then(setItems);
  }, []);

  useEffect(() => {
    if (configured) refresh();
  }, [configured, refresh]);

  if (!configured) return null;

  async function onSave() {
    const ok = await createSavedSearch(filters);
    if (ok) refresh();
    else window.location.href = "/auth/sign-in";
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={onSave}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#eef7f0] px-3 text-sm font-semibold text-[#203b2c] transition hover:bg-[#e3f1e6]"
      >
        <Bookmark className="h-4 w-4" aria-hidden="true" /> Save this search
      </button>
      {items.length > 0 ? (
        <div className="grid gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => onApply(item.filters)}
                className="truncate rounded-xl bg-[#f7f6f2] px-2 py-1 font-semibold text-[#27302b]"
              >
                {item.filters.location} · {item.filters.radiusMiles}mi
              </button>
              <button
                type="button"
                onClick={() => removeSavedSearch(item.id).then(refresh)}
                className="font-semibold text-[#8b3f35]"
                aria-label="Remove saved search"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
