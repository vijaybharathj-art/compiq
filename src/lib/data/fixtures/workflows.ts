import type { BankingService, BankingServiceCode, DealStageDefinition } from "@/types/domain";

export const bankingServices: BankingService[] = [
  { id: "MA", name: "M&A" },
  { id: "ECM", name: "ECM" },
  { id: "DCM", name: "DCM" },
  { id: "LEVERAGED_FINANCE", name: "Leveraged Finance" },
  { id: "RESTRUCTURING", name: "Restructuring" },
  { id: "PRIVATE_CAPITAL", name: "Private Capital" },
  { id: "FINANCIAL_ADVISORY", name: "Financial Advisory" },
  { id: "STRATEGIC_ADVISORY", name: "Strategic Advisory" },
  { id: "VALUATION", name: "Valuation" },
  { id: "OTHER", name: "Other" },
];

function stages(keys: [string, string][]): DealStageDefinition[] {
  return keys.map(([key, label], i) => ({ key, label, sortOrder: i }));
}

const maStages = stages([
  ["origination", "Origination"],
  ["initial_discussion", "Initial Discussion"],
  ["pitch", "Pitch"],
  ["mandate", "Mandate"],
  ["preparation", "Preparation"],
  ["teaser", "Teaser"],
  ["nda", "NDA"],
  ["information_memorandum", "Information Memorandum"],
  ["buyer_outreach", "Buyer Outreach"],
  ["management_meetings", "Management Meetings"],
  ["indicative_bids", "Indicative Bids"],
  ["final_bids", "Final Bids"],
  ["due_diligence", "Due Diligence"],
  ["documentation", "Documentation"],
  ["signing", "Signing"],
  ["closing", "Closing"],
]);

const ecmStages = stages([
  ["origination", "Origination"],
  ["pitch", "Pitch"],
  ["mandate", "Mandate"],
  ["structuring", "Structuring"],
  ["documentation", "Documentation"],
  ["regulatory", "Regulatory"],
  ["marketing", "Marketing"],
  ["bookbuilding", "Bookbuilding"],
  ["pricing", "Pricing"],
  ["allocation", "Allocation"],
  ["closing", "Closing"],
]);

const dcmStages = stages([
  ["origination", "Origination"],
  ["pitch", "Pitch"],
  ["mandate", "Mandate"],
  ["structuring", "Structuring"],
  ["rating", "Rating"],
  ["documentation", "Documentation"],
  ["marketing", "Marketing"],
  ["pricing", "Pricing"],
  ["allocation", "Allocation"],
  ["closing", "Closing"],
]);

const genericStages = stages([
  ["origination", "Origination"],
  ["pitch", "Pitch"],
  ["mandate", "Mandate"],
  ["execution", "Execution"],
  ["closing", "Closing"],
]);

export const workflowsByService: Record<BankingServiceCode, DealStageDefinition[]> = {
  MA: maStages,
  ECM: ecmStages,
  DCM: dcmStages,
  LEVERAGED_FINANCE: genericStages,
  RESTRUCTURING: stages([
    ["origination", "Origination"],
    ["pitch", "Pitch"],
    ["mandate", "Mandate"],
    ["assessment", "Assessment"],
    ["stakeholder_negotiation", "Stakeholder Negotiation"],
    ["documentation", "Documentation"],
    ["closing", "Closing"],
  ]),
  PRIVATE_CAPITAL: genericStages,
  FINANCIAL_ADVISORY: genericStages,
  STRATEGIC_ADVISORY: genericStages,
  VALUATION: genericStages,
  OTHER: genericStages,
};

export function getBankingService(id: BankingServiceCode) {
  return bankingServices.find((s) => s.id === id)!;
}
