import type { Opportunity } from "@/types/domain";

export const opportunities: Opportunity[] = [
  {
    id: "opp-1",
    clientId: "client-acme",
    potentialServiceId: "MA",
    signalText:
      "Acme's CFO discussed a potential acquisition of a European competitor during a routine relationship call.",
    confidencePercent: 83,
    recommendedAction: "Banker outreach to scope acquisition criteria and financing capacity.",
    status: "NEW",
    sourceEvidence: {
      id: "evidence-opp-1",
      senderName: "Linda Marsh",
      senderEmail: "l.marsh@acmeindustries.example",
      sentAt: "2026-08-22T16:20:00Z",
      subject: "Catching up",
      quotedExcerpt:
        "Separately, the board has asked us to start evaluating a potential acquisition of one of our European competitors — nothing formal yet, but wanted to flag it.",
      emailId: "email-opp-1",
    },
    createdAt: "2026-08-22T16:25:00Z",
  },
  {
    id: "opp-2",
    clientId: "client-halcyon",
    potentialServiceId: "DCM",
    signalText: "Halcyon Materials requested refinancing analysis for upcoming debt maturities.",
    confidencePercent: 82,
    recommendedAction: "Prepare indicative refinancing terms and introduce DCM coverage.",
    status: "NEW",
    sourceEvidence: {
      id: "evidence-opp-2",
      senderName: "Owen Prescott",
      senderEmail: "o.prescott@halcyonmaterials.example",
      sentAt: "2026-08-21T13:15:00Z",
      subject: "Upcoming maturities",
      quotedExcerpt:
        "We're evaluating financing options ahead of next year's maturities and would value your team's perspective on a refinancing.",
      emailId: "email-opp-2",
    },
    createdAt: "2026-08-21T13:20:00Z",
  },
  {
    id: "opp-3",
    clientId: "client-nimbus",
    potentialServiceId: "PRIVATE_CAPITAL",
    signalText: "Nimbus Logistics indicated interest in growth capital to fund fleet expansion.",
    confidencePercent: 91,
    recommendedAction: "Converted to Project Apollo mandate.",
    status: "CONVERTED_TO_DEAL",
    sourceEvidence: {
      id: "evidence-opp-3",
      senderName: "Carlos Reyes",
      senderEmail: "c.reyes@nimbuslogistics.example",
      sentAt: "2026-08-01T12:00:00Z",
      subject: "Expansion financing",
      quotedExcerpt:
        "We're looking for financing to support our fleet expansion plan and would like to explore a growth equity partner.",
      emailId: "email-opp-3",
    },
    createdAt: "2026-08-01T12:05:00Z",
  },
  {
    id: "opp-4",
    clientId: "client-solace",
    potentialServiceId: "STRATEGIC_ADVISORY",
    signalText: "Solace Renewables leadership mentioned evaluating a joint venture for a new storage facility.",
    confidencePercent: 68,
    recommendedAction: "Monitor — confidence below auto-surfacing threshold, revisit after IPO closes.",
    status: "ACKNOWLEDGED",
    sourceEvidence: {
      id: "evidence-opp-4",
      senderName: "Grace Kim",
      senderEmail: "g.kim@solacerenewables.example",
      sentAt: "2026-08-10T08:40:00Z",
      subject: "Post-IPO priorities",
      quotedExcerpt:
        "Once the IPO is behind us, we may want to explore a joint venture structure for the new storage facility.",
      emailId: "email-opp-4",
    },
    createdAt: "2026-08-10T08:45:00Z",
  },
];

export function getOpportunitiesForClient(clientId: string) {
  return opportunities.filter((o) => o.clientId === clientId);
}
