import { describe, expect, it } from "vitest";
import {
  daysSince,
  formatDate,
  formatEnumLabel,
  formatMoney,
  initials,
  relativeTimeFromNow,
} from "@/lib/format";

describe("formatMoney", () => {
  it("formats billions compactly", () => {
    expect(formatMoney({ amountMinorUnits: 1_500_000_000_00, currency: "USD" })).toBe("$1.5B");
  });

  it("formats millions compactly", () => {
    expect(formatMoney({ amountMinorUnits: 750_000_000_00, currency: "USD" })).toBe("$750M");
  });

  it("returns an em dash for missing values", () => {
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(null)).toBe("—");
  });
});

describe("formatEnumLabel", () => {
  it("title-cases underscore-separated enum values", () => {
    expect(formatEnumLabel("SELL_SIDE_MA")).toBe("Sell Side Ma");
    expect(formatEnumLabel("AT_RISK")).toBe("At Risk");
    expect(formatEnumLabel("ON_TRACK")).toBe("On Track");
  });
});

describe("initials", () => {
  it("takes the first letter of up to two words", () => {
    expect(initials("Bharath Vijay")).toBe("BV");
    expect(initials("Sarah Chen")).toBe("SC");
    expect(initials("Cher")).toBe("C");
  });
});

describe("daysSince / relativeTimeFromNow", () => {
  const now = new Date("2026-08-23T18:00:00Z");

  it("computes whole days elapsed", () => {
    expect(daysSince("2026-08-13T18:00:00Z", now)).toBe(10);
    expect(daysSince("2026-08-23T18:00:00Z", now)).toBe(0);
  });

  it("renders human-readable recency", () => {
    expect(relativeTimeFromNow("2026-08-23T17:30:00Z", now)).toBe("30m ago");
    expect(relativeTimeFromNow("2026-08-22T18:00:00Z", now)).toBe("1d ago");
  });

  it("falls back to an absolute date beyond a week", () => {
    expect(relativeTimeFromNow("2026-08-01T18:00:00Z", now)).toBe(formatDate("2026-08-01T18:00:00Z"));
  });
});
