"use client";
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { createLead } from "@/lib/data/leads";
import { validateLead } from "@/lib/data/mappers";
import { inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/Button";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-hairline bg-surface p-6 shadow-[0_30px_90px_rgba(22,24,23,0.22)]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-ink">Ask Tony about this lot</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft transition hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          {parcel.address}, {parcel.city}, {parcel.state}
        </p>
        {sent ? (
          <p className="mt-5 text-sm font-semibold text-brand">
            Thanks — Tony will be in touch.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 grid gap-3">
            <input
              required
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
            />
            <textarea
              required
              placeholder="Message"
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className={`${inputClass} h-auto min-h-28 py-3`}
            />
            {errors.length > 0 ? (
              <ul className="grid gap-1 text-xs text-risk">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            <button type="submit" className={buttonClass("primary", "lg", "w-full")}>
              Send to Tony
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
