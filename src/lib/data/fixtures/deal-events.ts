import type { DealEvent, Evidence } from "@/types/domain";

function ev(partial: Omit<Evidence, "id">, id: string): Evidence {
  return { id, ...partial };
}

export const dealEvents: DealEvent[] = [
  // --- Project Falcon --------------------------------------------------
  {
    id: "evt-falcon-1",
    dealId: "deal-falcon",
    type: "MILESTONE",
    occurredAt: "2026-07-29T10:00:00Z",
    note: "Opportunity originated from client conversation on strategic alternatives.",
  },
  {
    id: "evt-falcon-2",
    dealId: "deal-falcon",
    type: "STAGE_CHANGE",
    previousValue: "Origination",
    newValue: "Initial Discussion",
    occurredAt: "2026-08-05T09:00:00Z",
    note: "Initial client discussion held with Acme leadership.",
  },
  {
    id: "evt-falcon-3",
    dealId: "deal-falcon",
    type: "MILESTONE",
    occurredAt: "2026-08-12T09:00:00Z",
    note: "Teaser circulated to a shortlist of 12 strategic and financial buyers.",
  },
  {
    id: "evt-falcon-4",
    dealId: "deal-falcon",
    type: "MILESTONE",
    occurredAt: "2026-08-18T09:00:00Z",
    note: "NDA signed by Grantham Industrial Partners and Lockwood Capital.",
  },
  {
    id: "evt-falcon-5",
    dealId: "deal-falcon",
    type: "STAGE_CHANGE",
    previousValue: "Buyer Outreach",
    newValue: "Management Meetings",
    occurredAt: "2026-08-20T16:00:00Z",
    note: "Indicative valuation discussed ahead of management meetings.",
    confidencePercent: 91,
    evidence: ev(
      {
        senderName: "Robert Hayes",
        senderEmail: "r.hayes@acmeindustries.example",
        sentAt: "2026-08-20T15:42:00Z",
        subject: "RE: Project Falcon — next steps",
        quotedExcerpt:
          "We're comfortable moving forward with management meetings for the shortlisted parties next week.",
        emailId: "email-falcon-3",
      },
      "evidence-falcon-5",
    ),
  },
  {
    id: "evt-falcon-6",
    dealId: "deal-falcon",
    type: "VALUE_CHANGE",
    previousValue: "$680M",
    newValue: "$750M",
    occurredAt: "2026-08-23T14:10:00Z",
    note: "Enterprise value guidance revised upward following buyer interest.",
    confidencePercent: 94,
    evidence: ev(
      {
        senderName: "Robert Hayes",
        senderEmail: "r.hayes@acmeindustries.example",
        sentAt: "2026-08-23T14:02:00Z",
        subject: "Project Falcon — management meeting scheduling",
        quotedExcerpt:
          "Following yesterday's discussion, Acme is comfortable proceeding at an enterprise value of approximately $750m. They would like to proceed with management meetings next week.",
        emailId: "email-falcon-1",
      },
      "evidence-falcon-6",
    ),
  },
  {
    id: "evt-falcon-7",
    dealId: "deal-falcon",
    type: "MILESTONE",
    occurredAt: "2026-08-23T14:12:00Z",
    note: "Buyer requested management meetings for the week of Aug 28.",
    confidencePercent: 94,
  },

  // --- Project Atlas -----------------------------------------------------
  {
    id: "evt-atlas-1",
    dealId: "deal-atlas",
    type: "MILESTONE",
    occurredAt: "2026-06-10T09:00:00Z",
    note: "Mandate signed for $500M senior unsecured notes offering.",
  },
  {
    id: "evt-atlas-2",
    dealId: "deal-atlas",
    type: "STAGE_CHANGE",
    previousValue: "Structuring",
    newValue: "Rating",
    occurredAt: "2026-07-22T09:00:00Z",
    note: "Rating agency process kicked off with Sentinel Ratings Group.",
  },
  {
    id: "evt-atlas-3",
    dealId: "deal-atlas",
    type: "STAGE_CHANGE",
    previousValue: "Rating",
    newValue: "Documentation",
    occurredAt: "2026-08-19T11:25:00Z",
    note: "Preliminary rating received; documentation drafting underway.",
    confidencePercent: 92,
    evidence: ev(
      {
        senderName: "Linda Marsh",
        senderEmail: "l.marsh@acmeindustries.example",
        sentAt: "2026-08-19T11:10:00Z",
        subject: "RE: Atlas — rating outcome",
        quotedExcerpt:
          "Confirming the mandate is proceeding to documentation now that the preliminary rating has come back in line with expectations.",
        emailId: "email-atlas-1",
      },
      "evidence-atlas-3",
    ),
  },

  // --- Project Orion ----------------------------------------------------
  {
    id: "evt-orion-1",
    dealId: "deal-orion",
    type: "STAGE_CHANGE",
    previousValue: "Buyer Outreach",
    newValue: "Management Meetings",
    occurredAt: "2026-07-18T09:00:00Z",
    note: "Management meetings held with Cascade Health Partners.",
  },
  {
    id: "evt-orion-2",
    dealId: "deal-orion",
    type: "STAGE_CHANGE",
    previousValue: "Management Meetings",
    newValue: "Due Diligence",
    occurredAt: "2026-08-05T09:00:00Z",
    note: "Buyer entered confirmatory due diligence.",
  },
  {
    id: "evt-orion-3",
    dealId: "deal-orion",
    type: "MILESTONE",
    occurredAt: "2026-08-14T10:00:00Z",
    note: "Buyer requested EBITDA bridge and updated management projections.",
    confidencePercent: 90,
    evidence: ev(
      {
        senderName: "Dana Whitcombe",
        senderEmail: "d.whitcombe@meridianhealth.example",
        sentAt: "2026-08-14T09:55:00Z",
        subject: "Project Orion — buyer diligence request",
        quotedExcerpt:
          "Cascade's team has asked for an EBITDA bridge and refreshed projections before they can finalize their offer.",
        emailId: "email-orion-1",
      },
      "evidence-orion-3",
    ),
  },
  {
    id: "evt-orion-4",
    dealId: "deal-orion",
    type: "RISK_FLAGGED",
    occurredAt: "2026-08-23T08:00:00Z",
    note: "No client activity detected for 9 days despite two follow-up emails.",
  },

  // --- Project Phoenix ----------------------------------------------------
  {
    id: "evt-phoenix-1",
    dealId: "deal-phoenix",
    type: "STAGE_CHANGE",
    previousValue: "Stakeholder Negotiation",
    newValue: "Documentation",
    occurredAt: "2026-08-10T09:00:00Z",
    note: "Restructuring support agreement term sheet agreed with lender group.",
  },
  {
    id: "evt-phoenix-2",
    dealId: "deal-phoenix",
    type: "RISK_FLAGGED",
    occurredAt: "2026-08-22T17:45:00Z",
    note: "Two of five lenders have not yet confirmed consent ahead of the Sep 5 deadline.",
    confidencePercent: 87,
    evidence: ev(
      {
        senderName: "Michael Osei",
        senderEmail: "m.osei@vantageretail.example",
        sentAt: "2026-08-22T17:30:00Z",
        subject: "RE: Phoenix — lender consent tracker",
        quotedExcerpt:
          "Two lenders on the tracker still haven't responded — we may need to escalate before the Sep 5 deadline.",
        emailId: "email-phoenix-1",
      },
      "evidence-phoenix-2",
    ),
  },

  // --- Project Everest -----------------------------------------------------
  {
    id: "evt-everest-1",
    dealId: "deal-everest",
    type: "STAGE_CHANGE",
    previousValue: "Marketing",
    newValue: "Bookbuilding",
    occurredAt: "2026-08-21T09:00:00Z",
    note: "Bookbuilding opened following strong early investor feedback.",
  },
  {
    id: "evt-everest-2",
    dealId: "deal-everest",
    type: "MILESTONE",
    occurredAt: "2026-08-23T09:15:00Z",
    note: "Order book covered 2.1x within the first day of bookbuilding.",
    confidencePercent: 97,
    evidence: ev(
      {
        senderName: "Grace Kim",
        senderEmail: "g.kim@solacerenewables.example",
        sentAt: "2026-08-23T09:00:00Z",
        subject: "Everest — bookbuild update",
        quotedExcerpt:
          "Great momentum — the book is already covered 2.1x on day one. Let's lock in the roadshow calls for Wednesday.",
        emailId: "email-everest-1",
      },
      "evidence-everest-2",
    ),
  },

  // --- Project Apollo -----------------------------------------------------
  {
    id: "evt-apollo-1",
    dealId: "deal-apollo",
    type: "MILESTONE",
    occurredAt: "2026-08-05T09:00:00Z",
    note: "Opportunity converted to an active mandate for growth capital.",
  },
  {
    id: "evt-apollo-2",
    dealId: "deal-apollo",
    type: "STAGE_CHANGE",
    previousValue: "Pitch",
    newValue: "Mandate",
    occurredAt: "2026-08-20T13:30:00Z",
    note: "Engagement letter negotiations underway with Nimbus Logistics.",
  },
];

export function getDealEvents(dealId: string) {
  return dealEvents
    .filter((e) => e.dealId === dealId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
