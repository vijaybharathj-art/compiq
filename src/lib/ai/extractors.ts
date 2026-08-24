// Pure, individually-testable extraction helpers used by DemoAIProvider.
// Each function owns one concern (deadline normalization, stage-change
// detection, money parsing, risk phrasing, meeting typing, named-entity
// role capture) so extraction stays composable rather than one large
// function — see PHASE3_EMAIL_INTELLIGENCE.md §1's "every stage must be
// modular" instruction, applied at the extraction-stage level.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextWeekday(reference: Date, targetDay: number): Date {
  const result = new Date(reference);
  const diff = (targetDay - result.getDay() + 7) % 7 || 7;
  result.setDate(result.getDate() + diff);
  return result;
}

export interface DeadlineExtraction {
  originalText: string;
  normalizedDate: string | null;
  confidencePercent: number;
}

/**
 * Extracts an explicit deadline phrase and normalizes it against the
 * email's own received timestamp. Ambiguous phrasing ("next week", "before
 * the IC meeting") is preserved verbatim but never assigned a fabricated
 * date (spec §20).
 */
export function parseDeadline(text: string, referenceDate: Date): DeadlineExtraction | null {
  const monthPattern = new RegExp(
    `\\bby\\s+(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "i",
  );
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const monthIndex = MONTHS.indexOf(monthMatch[1].toLowerCase());
    const day = Number.parseInt(monthMatch[2], 10);
    let year = referenceDate.getFullYear();
    const candidate = new Date(Date.UTC(year, monthIndex, day));
    if (candidate.getTime() < referenceDate.getTime()) year += 1;
    return {
      originalText: monthMatch[0],
      normalizedDate: toISODate(new Date(Date.UTC(year, monthIndex, day))),
      confidencePercent: 95,
    };
  }

  const slashPattern = /\bby\s+(\d{1,2})\/(\d{1,2})\b/;
  const slashMatch = text.match(slashPattern);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10) - 1;
    const day = Number.parseInt(slashMatch[2], 10);
    let year = referenceDate.getFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getTime() < referenceDate.getTime()) year += 1;
    return {
      originalText: slashMatch[0],
      normalizedDate: toISODate(new Date(Date.UTC(year, month, day))),
      confidencePercent: 93,
    };
  }

  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 1);
    return { originalText: "tomorrow", normalizedDate: toISODate(d), confidencePercent: 94 };
  }

  if (/\btoday\b/i.test(text) && /\b(by|due)\s+today\b/i.test(text)) {
    return { originalText: "today", normalizedDate: toISODate(referenceDate), confidencePercent: 92 };
  }

  const weekdayPattern = new RegExp(`\\b(?:by|next)\\s+(${WEEKDAYS.join("|")})\\b`, "i");
  const weekdayMatch = text.match(weekdayPattern);
  if (weekdayMatch) {
    const targetDay = WEEKDAYS.indexOf(weekdayMatch[1].toLowerCase());
    const d = nextWeekday(referenceDate, targetDay);
    return { originalText: weekdayMatch[0], normalizedDate: toISODate(d), confidencePercent: 90 };
  }

  // Ambiguous phrasing — surface the signal but never fabricate a date.
  if (/\bbefore\s+the\s+ic\s+meeting\b/i.test(text)) {
    return { originalText: "before the IC meeting", normalizedDate: null, confidencePercent: 58 };
  }
  if (/\bnext\s+week\b/i.test(text)) {
    return { originalText: "next week", normalizedDate: null, confidencePercent: 55 };
  }
  if (/\bnext\s+month\b/i.test(text)) {
    return { originalText: "next month", normalizedDate: null, confidencePercent: 55 };
  }

  return null;
}

const STAGE_TRANSITIONS: { stageKey: string; nounPattern: RegExp; verbPattern: RegExp; confidencePercent: number }[] = [
  {
    stageKey: "management_meetings",
    nounPattern: /(management (meeting|access|presentation)|meet(?:ing)?\s+(?:with\s+)?management\b)/i,
    verbPattern: /(would like to|proceed( to| with)?|schedule|request(ed)?|move to|advance to|arrange)/i,
    confidencePercent: 96,
  },
  {
    stageKey: "due_diligence",
    nounPattern: /due diligence/i,
    verbPattern: /(begin|commence|start|proceed|data room access|kick off|kick-off)/i,
    confidencePercent: 93,
  },
  {
    stageKey: "indicative_bids",
    nounPattern: /indicative (bid|offer)/i,
    verbPattern: /(submit(ted)?|received|review(ing)?|invite)/i,
    confidencePercent: 91,
  },
  {
    stageKey: "final_bids",
    nounPattern: /final (bid|offer)/i,
    verbPattern: /(submit(ted)?|received|due|deadline)/i,
    confidencePercent: 92,
  },
  {
    stageKey: "documentation",
    nounPattern: /(term sheet|purchase agreement|spa\b)/i,
    verbPattern: /(circulat|receiv|agree|sign|draft)/i,
    confidencePercent: 88,
  },
  {
    stageKey: "signing",
    nounPattern: /\bsigning\b/i,
    verbPattern: /(schedule|target|proceed|confirm)/i,
    confidencePercent: 90,
  },
  {
    stageKey: "closing",
    nounPattern: /\bclosing\b/i,
    verbPattern: /(schedule|target|proceed|confirm)/i,
    confidencePercent: 90,
  },
];

export interface StageSignal {
  stageKey: string;
  confidencePercent: number;
  matchedPhrase: string;
}

/**
 * Only reports a stage transition when both a stage-defining noun phrase
 * AND an explicit forward-moving verb are present. Vague sentiment
 * ("good discussion today", "positive call") matches neither and never
 * triggers a stage change (spec §15).
 */
export function detectStageSignal(text: string): StageSignal | null {
  for (const rule of STAGE_TRANSITIONS) {
    const nounMatch = text.match(rule.nounPattern);
    if (nounMatch && rule.verbPattern.test(text)) {
      return { stageKey: rule.stageKey, confidencePercent: rule.confidencePercent, matchedPhrase: nounMatch[0] };
    }
  }
  return null;
}

const HEDGE_TERMS = [
  "could be", "might be", "may be", "we think", "possibly", "perhaps",
  "not confirmed", "tentative", "estimate", "estimated to be", "roughly",
  "believe", "likely",
];
const CONFIRM_TERMS = ["is", "confirmed at", "agreed at", "finalized at", "will be", "has been set at", "stands at"];
const MONEY_PATTERN = /\$\s*([\d,.]+)\s*(bn|billion|m|million|k|thousand)?/i;

export interface MoneySignal {
  amountMinorUnits: number;
  currency: string;
  confidencePercent: number;
  hedged: boolean;
  valueLabel: "enterprise" | "equity" | "deal";
}

function parseMoneyAmount(amountStr: string, unit?: string): number {
  const amount = Number.parseFloat(amountStr.replace(/,/g, ""));
  const lowerUnit = (unit ?? "").toLowerCase();
  const multiplier = lowerUnit.startsWith("b")
    ? 1_000_000_000
    : lowerUnit.startsWith("k") || lowerUnit === "thousand"
      ? 1_000
      : 1_000_000;
  return Math.round(amount * multiplier * 100);
}

/** Detects a dollar figure and whether the surrounding language hedges it (spec: test 1 vs test 2). */
export function detectMoneySignal(text: string): MoneySignal | null {
  const match = text.match(MONEY_PATTERN);
  if (!match) return null;

  const window = text.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + match[0].length + 20).toLowerCase();
  const hedged = HEDGE_TERMS.some((t) => window.includes(t));
  const confirmed = CONFIRM_TERMS.some((t) => window.includes(t));

  const valueLabel: MoneySignal["valueLabel"] = /equity value/i.test(window)
    ? "equity"
    : /enterprise value/i.test(window)
      ? "enterprise"
      : "deal";

  return {
    amountMinorUnits: parseMoneyAmount(match[1], match[2]),
    currency: "USD",
    confidencePercent: hedged ? 74 : confirmed ? 96 : 88,
    hedged,
    valueLabel,
  };
}

const RISK_PHRASES = [
  "no response from client",
  "hasn't responded",
  "has not responded",
  "concerns regarding valuation",
  "concerns about valuation",
  "concerns regarding",
  "concerns about",
  "timeline may need to be pushed",
  "timeline may slip",
  "financing remains unresolved",
  "reconsidering",
  "may reconsider",
  "remains unresolved",
  "pushed back",
  "gone quiet",
  "gone silent",
];

/** Never asserts risk as fact — every hit is phrased "Potential risk detected" (spec §22). */
export function detectRiskSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = RISK_PHRASES.filter((phrase) => lower.includes(phrase));
  return hits.map((phrase) => `Potential risk detected: ${phrase}.`);
}

const OPPORTUNITY_PHRASES = [
  "strategic alternatives",
  "considering a sale",
  "considering acquiring",
  "evaluating financing",
  "interested in acquiring",
  "looking for financing",
  "capital raise",
  "potential transaction",
  "exploring a sale",
  "exploring options",
];

export function detectOpportunitySignal(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = OPPORTUNITY_PHRASES.find((phrase) => lower.includes(phrase));
  return hit ? `Potential opportunity detected: ${hit}.` : null;
}

const MEETING_TYPES: { type: string; pattern: RegExp }[] = [
  { type: "MANAGEMENT_MEETING", pattern: /(management meeting|meet(?:ing)?\s+(?:with\s+)?management\b)/i },
  { type: "BUYER_MEETING", pattern: /buyer meeting/i },
  { type: "INVESTOR_MEETING", pattern: /investor meeting/i },
  { type: "IC_MEETING", pattern: /\bIC meeting\b/i },
  { type: "DUE_DILIGENCE_MEETING", pattern: /due diligence meeting/i },
  { type: "KICK_OFF", pattern: /kick[- ]?off/i },
  { type: "CLOSING_MEETING", pattern: /closing meeting/i },
];

export interface MeetingSignal {
  type: string;
  originalText: string;
  normalizedDate: string | null;
}

export function detectMeetings(text: string, referenceDate: Date): MeetingSignal[] {
  const found: MeetingSignal[] = [];
  for (const { type, pattern } of MEETING_TYPES) {
    const match = text.match(pattern);
    if (!match) continue;
    const deadline = parseDeadline(text, referenceDate);
    found.push({ type, originalText: match[0], normalizedDate: deadline?.normalizedDate ?? null });
  }
  return found;
}

const CODENAME_PATTERN = /project\s+([A-Z][a-z]+)/i;

export function extractProjectCodename(text: string): string | null {
  const match = text.match(CODENAME_PATTERN);
  return match ? `Project ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : null;
}

const ROLE_ALIASES: Record<string, string[]> = {
  buyer: ["buyer", "buyers", "acquirer"],
  seller: ["seller", "sellers", "vendor"],
  investor: ["investor", "investors"],
  lender: ["lender", "lenders"],
  advisor: ["advisor", "advisers", "financial advisor"],
  lawyer: ["counsel", "law firm", "lawyer", "legal counsel"],
  accountant: ["accountant", "auditor", "accounting firm"],
};

/**
 * Captures "<role label>: Name" or "the <role>, Name," style mentions.
 * Deliberately conservative — it only returns a name when a role marker
 * co-occurs with it, rather than guessing from free text.
 */
export function extractRoleMentions(text: string, role: keyof typeof ROLE_ALIASES): string[] {
  const aliases = ROLE_ALIASES[role];
  const names = new Set<string>();
  for (const alias of aliases) {
    const colonPattern = new RegExp(`${alias}\\s*[:\\-]\\s*([A-Z][\\w&.,' -]{2,60}?)(?:[.\\n]|,\\s+(?:would|has|is|will))`, "gi");
    for (const match of text.matchAll(colonPattern)) {
      names.add(match[1].trim());
    }
    const appositivePattern = new RegExp(`the ${alias},\\s+([A-Z][\\w&.,' -]{2,60}?),`, "gi");
    for (const match of text.matchAll(appositivePattern)) {
      names.add(match[1].trim());
    }
  }
  return Array.from(names);
}

const ACTION_PATTERN = /we (?:need|require)\s+([^.]+?)(?:\s+by\s+[^.]+)?\./gi;

export function extractActions(text: string): string[] {
  const actions: string[] = [];
  for (const match of text.matchAll(ACTION_PATTERN)) {
    actions.push(match[1].trim().replace(/^the\s+/i, ""));
  }
  return actions;
}
