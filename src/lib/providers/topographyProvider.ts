import type { Parcel } from "@/types/parcel";
import type {
  EvaluationProviderStatus,
  TopographyData,
} from "@/lib/providers/parcelEvaluationService";

function inferDrainage(parcel: Parcel): TopographyData["drainage"] {
  const terrain = parcel.terrain.toLowerCase();

  if (terrain.includes("drainage") || terrain.includes("pasture")) {
    return "moderate";
  }

  if (terrain.includes("flat") || terrain.includes("level")) {
    return "good";
  }

  if (terrain.includes("steep") || terrain.includes("hillside")) {
    return "poor";
  }

  return "unknown";
}

export const topographyProvider = {
  name: "topography" as const,

  getTopography(parcel: Parcel): TopographyData {
    const terrain = parcel.terrain.toLowerCase();

    return {
      slopePct: undefined,
      elevationFt: undefined,
      aspect: "unknown",
      drainage: inferDrainage(parcel),
      ridgelineRisk:
        terrain.includes("ridge") || terrain.includes("hilltop")
          ? "medium"
          : "unknown",
      cutFillComplexity:
        terrain.includes("steep") || terrain.includes("hillside")
          ? "High"
          : "Unknown",
      terrainDescription: parcel.terrain,
      providerStatus: {
        provider: "topography",
        status: "placeholder",
        message:
          "Topography is inferred from parcel text until USGS/terrain data is connected.",
      },
    };
  },

  providerStatus(): EvaluationProviderStatus {
    return {
      provider: "topography",
      status: "placeholder",
      message: "USGS/Mapbox terrain provider is not connected yet.",
    };
  },
};
