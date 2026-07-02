"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fromModelRow } from "@/lib/data/mappers";

export async function listActiveModels() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tony_tiny_home_models")
    .select("*")
    .eq("active", true)
    .order("square_feet", { ascending: true });
  if (error || !data) return [];
  return data.map(fromModelRow);
}
