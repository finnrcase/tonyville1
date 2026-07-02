export type CABNModel = {
  id: string;
  name: string;
  squareFeet: number;
  widthFt: number;
  lengthFt: number;
  basePrice?: number;
  requiredClearanceFt: number;
  defaultSetbackFt: number;
  foundationType: string;
  utilityNeeds: string[];
  description: string;
};

export const cabnModels: CABNModel[] = [
  {
    id: "cabn-120",
    name: "CABN 120",
    squareFeet: 120,
    widthFt: 10,
    lengthFt: 12,
    basePrice: 89000,
    requiredClearanceFt: 10,
    defaultSetbackFt: 5,
    foundationType: "pier",
    utilityNeeds: ["electricity", "water", "sewer or septic"],
    description: "Compact studio footprint for small yards and narrow parcels.",
  },
  {
    id: "cabn-140",
    name: "CABN 140",
    squareFeet: 140,
    widthFt: 10,
    lengthFt: 14,
    basePrice: 99000,
    requiredClearanceFt: 12,
    defaultSetbackFt: 5,
    foundationType: "pier",
    utilityNeeds: ["electricity", "water", "sewer or septic"],
    description: "A slightly deeper room for office, studio, or guest overflow use.",
  },
  {
    id: "cabn-160",
    name: "CABN 160",
    squareFeet: 160,
    widthFt: 10,
    lengthFt: 16,
    basePrice: 109000,
    requiredClearanceFt: 15,
    defaultSetbackFt: 5,
    foundationType: "pier",
    utilityNeeds: ["electricity", "water", "sewer or septic"],
    description: "Core CABN plan with a balanced footprint and utility path.",
  },
  {
    id: "cabn-200",
    name: "CABN 200",
    squareFeet: 200,
    widthFt: 10,
    lengthFt: 20,
    basePrice: 129000,
    requiredClearanceFt: 20,
    defaultSetbackFt: 5,
    foundationType: "pier",
    utilityNeeds: ["electricity", "water", "sewer or septic"],
    description: "Larger tiny-home plan for deeper lots and stronger access paths.",
  },
  {
    id: "cabn-480",
    name: "CABN 480",
    squareFeet: 480,
    widthFt: 16,
    lengthFt: 30,
    requiredClearanceFt: 25,
    defaultSetbackFt: 5,
    foundationType: "pier or helical",
    utilityNeeds: ["electricity", "water", "sewer or septic"],
    description: "Placeholder larger CABN concept for early site feasibility checks.",
  },
];

export function getCabnModel(idOrSize?: string | number | null) {
  if (!idOrSize) return cabnModels[1];
  const raw = String(idOrSize).toLowerCase();
  return (
    cabnModels.find((model) => model.id === raw) ??
    cabnModels.find((model) => String(model.squareFeet) === raw) ??
    cabnModels[1]
  );
}

export function cabnModelSizeForSearch(model: CABNModel) {
  return model.squareFeet;
}
