"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fromSavedSearchRow, toSavedSearchInsert } from "@/lib/data/mappers";
import type { SearchFilters } from "@/types/parcel";

export async function listSavedSearches() {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase
    .from("saved_searches")
    .select("id, filters, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromSavedSearchRow);
}

export async function createSavedSearch(filters: SearchFilters): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("saved_searches")
    .insert(toSavedSearchInsert(user.id, filters));
  return !error;
}

export async function removeSavedSearch(id: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  return !error;
}
