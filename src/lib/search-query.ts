import { workflowsByService } from "@/lib/data/fixtures/workflows";

// Lightweight natural-language-ish query parsing (PRODUCT_SPEC.md §4/17):
// pulls out a risk level, a stage name, and a dollar amount (used as a
// +/-20% band) from the raw query, leaving whatever free text remains for a
// plain substring search. Not NLP — a documented, extensible heuristic; see
// AI_EXTRACTION_SPEC.md for where a real model-backed parser would plug in.
//
// Pulled into its own module (no Prisma import) so it can be unit tested
// without a database connection — see tests/unit/search-query.test.ts.

export interface ParsedSearchQuery {
  freeText: string;
  riskStatus?: "ON_TRACK" | "WATCH" | "AT_RISK";
  stageKeys?: string[];
  valueMinMinorUnits?: bigint;
  valueMaxMinorUnits?: bigint;
}

const ALL_STAGE_LABELS = (() => {
  const labels = new Map<string, string[]>(); // label(lowercase) -> stage keys sharing it
  for (const stages of Object.values(workflowsByService)) {
    for (const s of stages) {
      const key = s.label.toLowerCase();
      labels.set(key, [...(labels.get(key) ?? []), s.key]);
    }
  }
  return labels;
})();

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let text = raw;
  let riskStatus: ParsedSearchQuery["riskStatus"];

  if (/\bhigh[- ]risk\b|\bat[- ]risk\b/i.test(text)) {
    riskStatus = "AT_RISK";
    text = text.replace(/\bhigh[- ]risk\b|\bat[- ]risk\b/gi, "");
  } else if (/\bwatch(list)?\b/i.test(text)) {
    riskStatus = "WATCH";
    text = text.replace(/\bwatch(list)?\b/gi, "");
  } else if (/\bon[- ]track\b|\blow[- ]risk\b/i.test(text)) {
    riskStatus = "ON_TRACK";
    text = text.replace(/\bon[- ]track\b|\blow[- ]risk\b/gi, "");
  }

  let valueMinMinorUnits: bigint | undefined;
  let valueMaxMinorUnits: bigint | undefined;
  const dollarMatch = text.match(/\$?\s*([\d.]+)\s*(b|bn|billion|m|million)\b/i);
  if (dollarMatch) {
    const amount = Number.parseFloat(dollarMatch[1]!);
    const isBillion = /^(b|bn|billion)$/i.test(dollarMatch[2]!);
    const minorUnits = BigInt(Math.round(amount * (isBillion ? 1_000_000_000 : 1_000_000) * 100));
    valueMinMinorUnits = (minorUnits * 80n) / 100n;
    valueMaxMinorUnits = (minorUnits * 120n) / 100n;
    text = text.replace(dollarMatch[0], "");
  }

  const stageKeys: string[] = [];
  for (const [label, keys] of ALL_STAGE_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(text)) {
      stageKeys.push(...keys);
      text = text.replace(re, "");
    }
  }

  return {
    freeText: text.replace(/\s+/g, " ").trim(),
    riskStatus,
    stageKeys: stageKeys.length ? stageKeys : undefined,
    valueMinMinorUnits,
    valueMaxMinorUnits,
  };
}
