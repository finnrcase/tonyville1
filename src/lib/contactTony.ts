import { formatAcres, formatCurrency } from "@/lib/format";
import type { CABNCompatibilityResult } from "@/lib/scoring/cabnCompatibilityScore";

export const TONY_CONTACT_EMAIL = "tony@tonysmoller.com";

export type TonyContactParcel = {
  title: string;
  address: string;
  city: string;
  state: string;
  price: number;
  acreage: number;
  fitScore: {
    total: number;
  };
  compatibility: {
    summary: string;
    selectedModel: {
      name: string;
    };
  };
  cabnCompatibility?: CABNCompatibilityResult;
};

export function buildTonyMailto(
  parcel: TonyContactParcel,
  currentUrl: string,
) {
  const subject = "Tonyville lot inquiry";
  const cabn = parcel.cabnCompatibility;
  const body = [
    "Hi Tony,",
    "",
    "I would like to ask about this Tonyville lot and its CABN fit:",
    "",
    `Parcel: ${parcel.title}`,
    `Address: ${parcel.address}, ${parcel.city}, ${parcel.state}`,
    `Price: ${formatCurrency.format(parcel.price)}`,
    `Lot size: ${formatAcres(parcel.acreage)}`,
    `LandFit Score: ${parcel.fitScore.total}`,
    cabn ? `CABN Compatibility Score: ${cabn.totalScore}` : undefined,
    cabn ? `CABN Rating: ${cabn.rating}` : undefined,
    cabn?.recommendedModel
      ? `Recommended CABN: ${cabn.recommendedModel.name}`
      : "Recommended CABN: Manual review needed",
    cabn ? `Data confidence: ${cabn.confidence}` : undefined,
    cabn?.warnings.length
      ? `Warnings: ${cabn.warnings.slice(0, 3).join("; ")}`
      : undefined,
    cabn?.unknowns.length
      ? `Unknowns: ${cabn.unknowns.slice(0, 3).join("; ")}`
      : undefined,
    "",
    `Tonyville link: ${currentUrl}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  return `mailto:${TONY_CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
