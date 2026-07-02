import "server-only";
import type {
  EnrichmentFragment,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
  SoilData,
} from "@/types/parcel";

const SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

type SoilRow = {
  mukey?: string;
  muname?: string;
  compname?: string;
  comppct_r?: string;
  drainagecl?: string;
  hydgrp?: string;
  taxclname?: string;
};

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "usdaSoil", status: state, message };
}

function unavailable(reason: string): SoilData {
  return {
    available: false,
    source: "Unavailable",
    confidence: "Low",
    notes: [`${reason}; soil suitability is unconfirmed.`],
  };
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function tableToRows(data: unknown): SoilRow[] {
  const table = (data as { Table?: unknown }).Table;
  if (!Array.isArray(table) || table.length < 2 || !Array.isArray(table[0])) {
    return [];
  }

  const headers = table[0].map(String);
  return table.slice(1).filter(Array.isArray).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = row[index];
      if (value !== null && value !== undefined) record[header] = String(value);
    });
    return record;
  });
}

function slopeRange(text?: string) {
  const matches = [...(text ?? "").matchAll(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*percent/gi)];
  const last = matches.at(-1);
  if (!last) return undefined;
  return { min: Number(last[1]), max: Number(last[2]) };
}

function drainageClass(raw?: string): SoilData["drainageClass"] {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("excessively") || value.includes("somewhat excessively")) return "Excellent";
  if (value.includes("well drained")) return "Good";
  if (value.includes("moderately")) return "Moderate";
  if (value.includes("poorly")) return "Poor";
  if (value.includes("very poorly")) return "Very Poor";
  return "Unknown";
}

function riskFromDrainage(drainage: SoilData["drainageClass"]): SoilData["drainageRisk"] {
  if (drainage === "Excellent" || drainage === "Good") return "Low";
  if (drainage === "Moderate") return "Medium";
  if (drainage === "Poor" || drainage === "Very Poor") return "High";
  return "Unknown";
}

function shrinkSwell(raw?: string): SoilData["shrinkSwellRisk"] {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("smectitic") || value.includes("vert") || value.includes("clay")) {
    return "High";
  }
  if (value.includes("fine") || value.includes("loam")) return "Medium";
  if (value) return "Low";
  return "Unknown";
}

function erosionRisk(mapUnitName?: string): SoilData["erosionRisk"] {
  const slope = slopeRange(mapUnitName);
  if (!slope) return "Unknown";
  if (slope.max >= 15) return "High";
  if (slope.max >= 8) return "Medium";
  return "Low";
}

function septicSuitability(input: {
  drainage: SoilData["drainageClass"];
  hydgrp?: string;
  slope?: ReturnType<typeof slopeRange>;
}): SoilData["septicSuitability"] {
  const hydgrp = (input.hydgrp ?? "").toUpperCase();
  if (input.drainage === "Poor" || input.drainage === "Very Poor" || hydgrp.includes("D")) {
    return "Poor";
  }
  if (input.slope && input.slope.max >= 15) return "Fair";
  if (hydgrp.includes("C") || input.drainage === "Moderate") return "Fair";
  if (hydgrp.includes("A") && input.drainage === "Excellent") return "Excellent";
  if (hydgrp.includes("A") || hydgrp.includes("B") || input.drainage === "Good") return "Good";
  return "Unknown";
}

function foundationSuitability(input: {
  drainage: SoilData["drainageClass"];
  shrink: SoilData["shrinkSwellRisk"];
  erosion: SoilData["erosionRisk"];
}): SoilData["foundationSuitability"] {
  if (input.drainage === "Poor" || input.drainage === "Very Poor" || input.shrink === "High") {
    return "Poor";
  }
  if (input.erosion === "High" || input.shrink === "Medium" || input.drainage === "Moderate") {
    return "Fair";
  }
  if (input.drainage === "Excellent" && input.shrink === "Low") return "Excellent";
  if (input.drainage === "Good") return "Good";
  return "Unknown";
}

function excavationDifficulty(input: {
  shrink: SoilData["shrinkSwellRisk"];
  erosion: SoilData["erosionRisk"];
  slope?: ReturnType<typeof slopeRange>;
}): SoilData["estimatedExcavationDifficulty"] {
  if (input.slope && input.slope.max >= 15) return "High";
  if (input.shrink === "High" || input.erosion === "High") return "High";
  if (input.shrink === "Medium" || input.erosion === "Medium") return "Medium";
  if (input.shrink === "Low" || input.erosion === "Low") return "Low";
  return "Unknown";
}

async function querySoils(lat: number, lng: number): Promise<SoilRow[]> {
  const point = escapeSqlLiteral(`point(${lng} ${lat})`);
  const query =
    "SELECT TOP 1 mu.mukey, mu.muname, co.compname, co.comppct_r, co.drainagecl, co.hydgrp, co.taxclname " +
    "FROM mapunit mu INNER JOIN component co ON co.mukey = mu.mukey " +
    `WHERE mu.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}')) ` +
    "ORDER BY co.comppct_r DESC";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(SDA_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      throw new Error(`USDA SDA returned ${response.status}`);
    }
    return tableToRows(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSoilData(input: {
  lat: number;
  lng: number;
}): Promise<SoilData> {
  try {
    const row = (await querySoils(input.lat, input.lng))[0];
    if (!row) {
      return {
        available: true,
        source: "USDA SSURGO",
        confidence: "Low",
        notes: ["USDA SSURGO returned no dominant soil component for this point."],
      };
    }

    const drainage = drainageClass(row.drainagecl);
    const slope = slopeRange(row.muname);
    const shrink = shrinkSwell(row.taxclname);
    const erosion = erosionRisk(row.muname);
    const septic = septicSuitability({ drainage, hydgrp: row.hydgrp, slope });
    const foundation = foundationSuitability({ drainage, shrink, erosion });
    const excavation = excavationDifficulty({ shrink, erosion, slope });
    const drainageRisk = riskFromDrainage(drainage);

    const notes = [
      `${row.muname ?? "Unknown map unit"}; dominant component ${row.compname ?? "unknown"}.`,
      `${row.drainagecl ?? "Unknown drainage class"}; hydrologic group ${row.hydgrp ?? "unknown"}.`,
    ];
    if (foundation === "Poor") notes.push("Geotechnical/foundation review recommended.");
    if (septic === "Poor" || septic === "Fair") notes.push("Septic feasibility review recommended.");

    return {
      available: true,
      mapUnitName: row.muname,
      componentName: row.compname,
      drainageClass: drainage,
      septicSuitability: septic,
      foundationSuitability: foundation,
      shrinkSwellRisk: shrink,
      erosionRisk: erosion,
      drainageRisk,
      estimatedExcavationDifficulty: excavation,
      confidence: row.compname ? "High" : "Medium",
      source: "USDA SSURGO",
      notes,
    };
  } catch (error) {
    console.warn(
      `[Tonyville provider:usdaSoil] ${
        error instanceof Error ? error.message : "USDA soil request failed"
      }`,
    );
    return unavailable("USDA SSURGO request failed");
  }
}

export const usdaSoilEnricher: ParcelEnricher = {
  name: "usdaSoil",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const soil = await getSoilData({ lat: lookup.lat, lng: lookup.lng });
    return {
      soil,
      status: soil.available
        ? status("ready", "USDA SSURGO soil screening loaded.")
        : status("error", "USDA SSURGO soil data unavailable."),
    };
  },
};

export const usdaSoilProvider = {
  name: "usdaSoil" as const,
  enricher: usdaSoilEnricher,
  getSoilData,
};
