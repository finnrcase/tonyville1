"use client";
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { createLead } from "@/lib/data/leads";
import { validateLead } from "@/lib/data/mappers";
import type { ScoredParcel } from "@/types/parcel";

export function ContactTonyModal({
  parcel,
  onClose,
}: {
  parcel: ScoredParcel;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const check = validateLead(form);
    if (!check.valid) {
      setErrors(check.errors);
      return;
    }
    const ok = await createLead({
      ...form,
      selectedParcelId: parcel.id,
      selectedModel: parcel.compatibility.selectedModel.name,
    });
    if (ok) setSent(true);
    else setErrors(["Could not send right now. Please try again."]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111817]/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111817]">Ask Tony about this lot</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-[#27302b]" />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#66716a]">
          {parcel.address}, {parcel.city}, {parcel.state}
        </p>
        {sent ? (
          <p className="mt-4 text-sm font-semibold text-[#203b2c]">
            Thanks — Tony will be in touch.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <input
              required
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
            />
            <input
              placeholder="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
            />
            <textarea
              required
              placeholder="Message"
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
            />
            {errors.length > 0 ? (
              <ul className="text-xs text-[#8b3f35]">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="submit"
              className="rounded-2xl bg-[#203b2c] px-4 py-3 text-sm font-semibold text-white"
            >
              Send to Tony
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
