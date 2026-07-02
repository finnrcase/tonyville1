import { describe, expect, it } from "vitest";
import {
  fromModelRow,
  toLeadInsert,
  toSavedParcelInsert,
  toSavedSearchInsert,
  validateLead,
} from "@/lib/data/mappers";
import type { ScoredParcel, SearchFilters } from "@/types/parcel";

const filters: SearchFilters = {
  location: "Austin, TX",
  radiusMiles: 55,
  maxPrice: 140000,
  modelSize: 160,
  utilities: { water: false, electricity: false, sewerSeptic: false },
  requiresRoadAccess: true,
  permitFriendliness: "any",
};

describe("validateLead", () => {
  it("rejects missing fields and bad email", () => {
    expect(validateLead({ name: "", email: "x", message: "" }).valid).toBe(false);
    expect(validateLead({ name: "A", email: "not-an-email", message: "hi" }).valid).toBe(false);
  });
  it("accepts a valid lead", () => {
    expect(validateLead({ name: "Ann", email: "a@b.com", message: "Interested" }).valid).toBe(true);
  });
});

describe("toSavedSearchInsert", () => {
  it("denormalizes filter columns and stores the blob", () => {
    const row = toSavedSearchInsert("u1", filters);
    expect(row).toMatchObject({
      user_id: "u1",
      location: "Austin, TX",
      radius: 55,
      max_price: 140000,
      selected_tiny_home_model: 160,
    });
    expect(row.filters).toEqual(filters);
  });
});

describe("toSavedParcelInsert", () => {
  it("maps id, address, score, and data", () => {
    const parcel = {
      id: "regrid-1",
      address: "1 A St",
      city: "Bastrop",
      state: "TX",
      fitScore: { total: 88 },
    } as unknown as ScoredParcel;
    const row = toSavedParcelInsert("u1", parcel);
    expect(row).toMatchObject({
      user_id: "u1",
      parcel_id: "regrid-1",
      parcel_address: "1 A St, Bastrop, TX",
      score: 88,
    });
    expect(row.parcel_data).toBe(parcel);
  });
});

describe("toLeadInsert + fromModelRow", () => {
  it("builds a lead row with default-safe fields", () => {
    const row = toLeadInsert({
      name: "Ann",
      email: "a@b.com",
      message: "Hi",
      selectedParcelId: "regrid-1",
    });
    expect(row).toMatchObject({
      name: "Ann",
      email: "a@b.com",
      message: "Hi",
      selected_parcel_id: "regrid-1",
      phone: null,
    });
  });
  it("maps a model row to domain", () => {
    const model = fromModelRow({
      id: "m1",
      name: "Tony 160",
      square_feet: 160,
      base_price: null,
      minimum_lot_size: 0.12,
      utility_requirements: ["water"],
      description: "d",
      image_url: null,
      active: true,
      created_at: "2026-01-01",
    });
    expect(model).toMatchObject({
      id: "m1",
      name: "Tony 160",
      squareFeet: 160,
      minimumLotSize: 0.12,
    });
  });
});
