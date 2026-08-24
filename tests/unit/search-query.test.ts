import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/search-query";

describe("parseSearchQuery", () => {
  it("leaves plain text untouched", () => {
    const result = parseSearchQuery("Falcon");
    expect(result.freeText).toBe("Falcon");
    expect(result.riskStatus).toBeUndefined();
    expect(result.stageKeys).toBeUndefined();
    expect(result.valueMinMinorUnits).toBeUndefined();
  });

  it("detects 'high risk' as AT_RISK and strips it from free text", () => {
    const result = parseSearchQuery("high risk deals");
    expect(result.riskStatus).toBe("AT_RISK");
    expect(result.freeText).toBe("deals");
  });

  it("detects 'at risk' as AT_RISK", () => {
    expect(parseSearchQuery("at risk").riskStatus).toBe("AT_RISK");
  });

  it("detects 'watchlist' as WATCH", () => {
    expect(parseSearchQuery("watchlist").riskStatus).toBe("WATCH");
  });

  it("detects 'on track' as ON_TRACK", () => {
    expect(parseSearchQuery("on track").riskStatus).toBe("ON_TRACK");
  });

  it("parses a dollar amount in millions into a +/-20% band", () => {
    const result = parseSearchQuery("$500M");
    expect(result.valueMinMinorUnits).toBe((500_000_000_00n * 80n) / 100n);
    expect(result.valueMaxMinorUnits).toBe((500_000_000_00n * 120n) / 100n);
  });

  it("parses a dollar amount in billions", () => {
    const result = parseSearchQuery("$1.2B");
    const expectedCenter = 1_200_000_000_00n;
    expect(result.valueMinMinorUnits).toBe((expectedCenter * 80n) / 100n);
    expect(result.valueMaxMinorUnits).toBe((expectedCenter * 120n) / 100n);
  });

  it("detects a known stage label", () => {
    const result = parseSearchQuery("due diligence");
    expect(result.stageKeys).toContain("due_diligence");
    expect(result.freeText).toBe("");
  });

  it("combines multiple structured filters with leftover free text", () => {
    const result = parseSearchQuery("Acme high risk due diligence");
    expect(result.riskStatus).toBe("AT_RISK");
    expect(result.stageKeys).toContain("due_diligence");
    expect(result.freeText).toBe("Acme");
  });
});
