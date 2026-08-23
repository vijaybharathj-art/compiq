import type { IntelligenceItem } from "@/types/domain";

export const intelligenceItems: IntelligenceItem[] = [
  {
    id: "intel-1",
    category: "DEAL_CHANGE",
    dealId: "deal-falcon",
    headline: "Project Falcon — deal stage changed",
    detail: "Buyer requested management meetings.",
    delta: { from: "Buyer Outreach", to: "Management Meetings" },
    confidencePercent: 94,
    occurredAt: "2026-08-23T14:12:00Z",
    evidence: {
      id: "evidence-intel-1",
      senderName: "Robert Hayes",
      senderEmail: "r.hayes@acmeindustries.example",
      sentAt: "2026-08-23T14:02:00Z",
      subject: "Project Falcon — management meeting scheduling",
      quotedExcerpt:
        "Following yesterday's discussion, Acme is comfortable proceeding at an enterprise value of approximately $750m. They would like to proceed with management meetings next week.",
      emailId: "email-falcon-1",
    },
  },
  {
    id: "intel-2",
    category: "DEAL_CHANGE",
    dealId: "deal-falcon",
    headline: "Project Falcon — estimated value increased",
    delta: { from: "$680M", to: "$750M" },
    confidencePercent: 94,
    occurredAt: "2026-08-23T14:10:00Z",
    evidence: {
      id: "evidence-intel-2",
      senderName: "Robert Hayes",
      senderEmail: "r.hayes@acmeindustries.example",
      sentAt: "2026-08-23T14:02:00Z",
      subject: "Project Falcon — management meeting scheduling",
      quotedExcerpt:
        "Following yesterday's discussion, Acme is comfortable proceeding at an enterprise value of approximately $750m.",
      emailId: "email-falcon-1",
    },
  },
  {
    id: "intel-3",
    category: "OPPORTUNITY",
    clientId: "client-halcyon",
    headline: "Halcyon Materials — client requested refinancing analysis",
    detail: "Potential DCM opportunity detected.",
    confidencePercent: 82,
    occurredAt: "2026-08-21T13:20:00Z",
    evidence: {
      id: "evidence-intel-3",
      senderName: "Owen Prescott",
      senderEmail: "o.prescott@halcyonmaterials.example",
      sentAt: "2026-08-21T13:15:00Z",
      subject: "Upcoming maturities",
      quotedExcerpt:
        "We're evaluating financing options ahead of next year's maturities and would value your team's perspective on a refinancing.",
      emailId: "email-opp-2",
    },
  },
  {
    id: "intel-4",
    category: "OPPORTUNITY",
    clientId: "client-acme",
    headline: "Acme Industries — potential acquisition of European competitor",
    detail: "Acme CFO discussed potential acquisition of a European competitor.",
    confidencePercent: 83,
    occurredAt: "2026-08-22T16:25:00Z",
    evidence: {
      id: "evidence-intel-4",
      senderName: "Linda Marsh",
      senderEmail: "l.marsh@acmeindustries.example",
      sentAt: "2026-08-22T16:20:00Z",
      subject: "Catching up",
      quotedExcerpt:
        "Separately, the board has asked us to start evaluating a potential acquisition of one of our European competitors — nothing formal yet, but wanted to flag it.",
      emailId: "email-opp-1",
    },
  },
  {
    id: "intel-5",
    category: "RISK",
    dealId: "deal-orion",
    clientId: "client-meridian",
    headline: "Project Orion — no client activity detected for 9 days",
    detail: "Deal may require banker follow-up.",
    occurredAt: "2026-08-23T08:00:00Z",
  },
  {
    id: "intel-6",
    category: "RISK",
    dealId: "deal-phoenix",
    clientId: "client-vantage",
    headline: "Project Phoenix — lender consent at risk",
    detail: "Two of five lenders have not confirmed consent ahead of the Sep 5 deadline.",
    confidencePercent: 87,
    occurredAt: "2026-08-22T17:45:00Z",
    evidence: {
      id: "evidence-intel-6",
      senderName: "Michael Osei",
      senderEmail: "m.osei@vantageretail.example",
      sentAt: "2026-08-22T17:30:00Z",
      subject: "RE: Phoenix — lender consent tracker",
      quotedExcerpt:
        "Two lenders on the tracker still haven't responded — we may need to escalate before the Sep 5 deadline.",
      emailId: "email-phoenix-1",
    },
  },
  {
    id: "intel-7",
    category: "DEAL_CHANGE",
    dealId: "deal-everest",
    clientId: "client-solace",
    headline: "Project Everest — order book covered 2.1x",
    detail: "Bookbuilding tracking well ahead of pricing.",
    confidencePercent: 97,
    occurredAt: "2026-08-23T09:15:00Z",
    evidence: {
      id: "evidence-intel-7",
      senderName: "Grace Kim",
      senderEmail: "g.kim@solacerenewables.example",
      sentAt: "2026-08-23T09:00:00Z",
      subject: "Everest — bookbuild update",
      quotedExcerpt:
        "Great momentum — the book is already covered 2.1x on day one. Let's lock in the roadshow calls for Wednesday.",
      emailId: "email-everest-1",
    },
  },
  {
    id: "intel-8",
    category: "CLIENT_ACTIVITY",
    clientId: "client-acme",
    dealId: "deal-atlas",
    headline: "Acme Industries — Atlas mandate advancing to documentation",
    detail: "Preliminary rating received in line with expectations.",
    confidencePercent: 92,
    occurredAt: "2026-08-19T11:25:00Z",
  },
  {
    id: "intel-9",
    category: "TASK",
    dealId: "deal-orion",
    clientId: "client-meridian",
    headline: "New task — provide EBITDA bridge to buyer",
    detail: "Cascade Health Partners requested an EBITDA bridge before finalizing their offer.",
    confidencePercent: 90,
    occurredAt: "2026-08-14T10:05:00Z",
  },
  {
    id: "intel-10",
    category: "IMPORTANT_EMAIL",
    dealId: "deal-phoenix",
    clientId: "client-vantage",
    headline: "Vantage Retail Group — lender consent tracker shared",
    occurredAt: "2026-08-22T17:30:00Z",
    evidence: {
      id: "evidence-intel-10",
      senderName: "Michael Osei",
      senderEmail: "m.osei@vantageretail.example",
      sentAt: "2026-08-22T17:30:00Z",
      subject: "RE: Phoenix — lender consent tracker",
      quotedExcerpt:
        "Two lenders on the tracker still haven't responded — we may need to escalate before the Sep 5 deadline.",
      emailId: "email-phoenix-1",
    },
  },
];

export function getIntelligenceForDeal(dealId: string) {
  return intelligenceItems.filter((i) => i.dealId === dealId);
}

export function getIntelligenceForClient(clientId: string) {
  return intelligenceItems.filter((i) => i.clientId === clientId);
}
