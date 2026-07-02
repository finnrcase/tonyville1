import type { ScoredParcel, SearchFilters } from "@/types/parcel";

export type LeadInput = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  selectedParcelId?: string;
  selectedModel?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLead(input: Partial<LeadInput>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input.name?.trim()) errors.push("Name is required.");
  if (!input.email?.trim() || !EMAIL_RE.test(input.email)) {
    errors.push("A valid email is required.");
  }
  if (!input.message?.trim()) errors.push("A message is required.");
  return { valid: errors.length === 0, errors };
}

export function toLeadInsert(input: LeadInput) {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    phone: input.phone?.trim() || null,
    selected_parcel_id: input.selectedParcelId ?? null,
    selected_model: input.selectedModel ?? null,
  };
}

export function toSavedSearchInsert(userId: string, filters: SearchFilters) {
  return {
    user_id: userId,
    location: filters.location,
    radius: filters.radiusMiles,
    max_price: filters.maxPrice,
    selected_tiny_home_model: filters.modelSize,
    filters,
  };
}

export function fromSavedSearchRow(row: {
  id: string;
  filters: unknown;
  created_at: string;
}): { id: string; filters: SearchFilters; createdAt: string } {
  return {
    id: row.id,
    filters: row.filters as SearchFilters,
    createdAt: row.created_at,
  };
}

export function toSavedParcelInsert(userId: string, parcel: ScoredParcel) {
  return {
    user_id: userId,
    parcel_id: parcel.id,
    parcel_address: `${parcel.address}, ${parcel.city}, ${parcel.state}`,
    parcel_data: parcel,
    score: parcel.fitScore.total,
    notes: null as string | null,
  };
}

export function fromModelRow(row: {
  id: string;
  name: string;
  square_feet: number | null;
  base_price: number | null;
  minimum_lot_size: number | null;
  utility_requirements: unknown;
  description: string | null;
  image_url: string | null;
  active: boolean;
  created_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    squareFeet: row.square_feet,
    basePrice: row.base_price,
    minimumLotSize: row.minimum_lot_size,
    utilityRequirements: (row.utility_requirements as string[]) ?? [],
    description: row.description,
    imageUrl: row.image_url,
    active: row.active,
    createdAt: row.created_at,
  };
}
