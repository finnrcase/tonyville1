import { describe, expect, it } from "vitest";
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";

describe("format helpers", () => {
  it("formats currency without cents", () => {
    expect(formatCurrency.format(140000)).toBe("$140,000");
  });

  it("formats acres and miles with one decimal", () => {
    expect(formatAcres(0.5)).toBe("0.5 ac");
    expect(formatMiles(12.34)).toBe("12.3 mi");
  });
});
