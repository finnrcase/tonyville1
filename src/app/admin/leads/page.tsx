import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  if (!(await isCurrentUserAdmin())) {
    redirect("/auth/sign-in?next=/admin/leads");
  }

  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, name, email, phone, selected_parcel_id, selected_model, message, status, created_at",
    )
    .order("created_at", { ascending: false });

  const rows = leads ?? [];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold text-[#111817]">Leads</h1>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#edf0ec]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f2] text-xs uppercase text-[#66716a]">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Parcel</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id} className="border-t border-[#edf0ec]">
                <td className="whitespace-nowrap px-3 py-2">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">{lead.name}</td>
                <td className="px-3 py-2">{lead.email}</td>
                <td className="px-3 py-2">{lead.selected_parcel_id ?? "—"}</td>
                <td className="px-3 py-2">{lead.selected_model ?? "—"}</td>
                <td className="px-3 py-2">{lead.status}</td>
                <td className="max-w-xs truncate px-3 py-2" title={lead.message}>
                  {lead.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#66716a]">No leads yet.</p>
      ) : null}
    </main>
  );
}
