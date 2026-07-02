"use client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toSavedParcelInsert } from "@/lib/data/mappers";
import type { ScoredParcel } from "@/types/parcel";

export async function listSavedParcelIds(): Promise<string[]> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("saved_parcels").select("parcel_id");
    if (error) {
      console.warn(`[Tonyville supabase] saved_parcels select failed: ${error.message}`);
      return [];
    }
    return (data ?? []).map((row) => row.parcel_id);
  } catch (error) {
    console.warn(
      `[Tonyville supabase] saved_parcels select failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export async function saveParcel(parcel: ScoredParcel): Promise<boolean> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return false;
    const { error } = await supabase
      .from("saved_parcels")
      .upsert(toSavedParcelInsert(user.id, parcel), {
        onConflict: "user_id,parcel_id",
      });
    if (error) {
      console.warn(`[Tonyville supabase] saved_parcels upsert failed: ${error.message}`);
    }
    return !error;
  } catch (error) {
    console.warn(
      `[Tonyville supabase] saved_parcels upsert failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

export async function unsaveParcel(parcelId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("saved_parcels")
      .delete()
      .eq("parcel_id", parcelId);
    if (error) {
      console.warn(`[Tonyville supabase] saved_parcels delete failed: ${error.message}`);
    }
    return !error;
  } catch (error) {
    console.warn(
      `[Tonyville supabase] saved_parcels delete failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
