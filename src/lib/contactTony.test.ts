import { describe, expect, it } from "vitest";
import { buildTonyMailto, TONY_CONTACT_EMAIL } from "@/lib/contactTony";

describe("buildTonyMailto", () => {
  it("creates a Tony inquiry email with parcel and model context", () => {
    const href = buildTonyMailto(
      {
        title: "Cedar Creek Mini Ranch",
        address: "148 Mesquite Bend Rd",
        city: "Cedar Creek",
        state: "TX",
        price: 84000,
        acreage: 0.72,
        fitScore: { total: 92 },
        compatibility: {
          summary: "Excellent Fit for the Tony 160 Classic",
          selectedModel: {
            name: "Tony 160 Classic",
          },
        },
        cabnCompatibility: {
          totalScore: 88,
          rating: "Excellent",
          canBuild: true,
          recommendedModel: {
            id: "cabn-160",
            name: "CABN 160 Classic",
            sizeSqft: 160,
            widthFt: 10,
            lengthFt: 16,
            footprintSqft: 160,
            minimumLotAcres: 0.12,
            preferredLotAcres: 0.24,
            requiredClearanceFt: 15,
            minimumRoadWidthFt: 11,
            maximumSlopePct: 12,
            foundation: "pier",
            utilityRequirements: ["electricity", "water", "septicOrSewer"],
          },
          possibleModels: [],
          blockers: [],
          warnings: ["Setbacks need county confirmation."],
          strengths: [],
          unknowns: ["Fire severity is unknown."],
          categoryScores: {
            geometry: {} as never,
            physicalFit: {} as never,
            topography: {} as never,
            regulatory: {} as never,
            utilities: {} as never,
            complexity: {} as never,
          },
          permittingComplexity: "Low",
          siteComplexity: "Medium",
          confidence: "Medium",
          nextSteps: [],
        },
      },
      "https://tonyville.example/lots?location=Austin",
    );

    expect(href.startsWith(`mailto:${TONY_CONTACT_EMAIL}?`)).toBe(true);

    const params = new URLSearchParams(href.split("?")[1]);
    const body = params.get("body") ?? "";

    expect(params.get("subject")).toBe("Tonyville lot inquiry");
    expect(body).toContain("Parcel: Cedar Creek Mini Ranch");
    expect(body).toContain("Price: $84,000");
    expect(body).toContain("Lot size: 0.7 ac");
    expect(body).toContain("LandFit Score: 92");
    expect(body).toContain("CABN Compatibility Score: 88");
    expect(body).toContain("Recommended CABN: CABN 160 Classic");
    expect(body).toContain("Warnings: Setbacks need county confirmation.");
    expect(body).toContain("https://tonyville.example/lots?location=Austin");
  });
});
