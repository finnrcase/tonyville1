"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toLeadInsert, type LeadInput } from "@/lib/data/mappers";

export async function createLead(input: LeadInput): Promise<boolean> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("leads").insert(toLeadInsert(input));
    if (error) {
      console.warn(`[Tonyville supabase] leads insert failed: ${error.message}`);
    }
    return !error;
  } catch (error) {
    console.warn(
      `[Tonyville supabase] leads insert failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
