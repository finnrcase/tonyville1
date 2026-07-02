import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at")
    .eq("id", user.id)
    .single();
  return data;
}

export async function isCurrentUserAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}
