import type { Rng } from "./rng";
import { pick, randomInt } from "./rng";

// Backlog email generator for Phase 3 (PHASE3_EMAIL_INTELLIGENCE.md §26/§28).
// Unlike the rest of prisma/seed.ts, these rows are inserted with
// processingStatus PENDING and no relevance/classification — they are the
// unprocessed mailbox "Run Scan" actually works through, exercising the
// real pipeline (classification → extraction → matching → change
// detection → tasks/risks/opportunities), not pre-baked history.

export interface BankerRef {
  name: string;
  email: string;
}

export interface DealRef {
  id: string;
  projectCodename: string;
  clientId: string;
  clientName: string;
  bankingServiceId: string;
  currentStageId: string;
  currentStageKey: string;
  buyerCompanyName: string;
}

export interface ContactRef {
  name: string;
  email: string;
  clientName: string;
}

export interface BacklogEmail {
  /** Existing thread id to append to, or undefined to start a new (unlinked) thread. */
  threadId?: string;
  newThreadSubject?: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
}

function threadIdFor(dealId: string) {
  return `thread-${dealId}`;
}

/**
 * Curated emails engineered to reliably exercise the specific scenarios
 * spec §29 asks for, using real seeded deals/clients so the demo scan
 * produces a genuine, inspectable result (spec §38 — never a hardcoded
 * summary).
 */
function curatedEmails(now: Date, deals: {
  falcon?: DealRef;
  atlas?: DealRef;
  orion?: DealRef;
  mgmtMeetingCandidate?: DealRef;
}, halcyon?: ContactRef, bharath?: BankerRef): BacklogEmail[] {
  const emails: BacklogEmail[] = [];
  const mins = (n: number) => new Date(now.getTime() - n * 60_000);

  if (deals.falcon) {
    const d = deals.falcon;
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Robert Hayes",
      fromAddress: "robert.hayes@acmeindustries.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Re: Project Falcon — Updated Offer",
      bodyText: `Following the buyer's latest indication, enterprise value is now $780M for Project Falcon, up from the previous mark. We'd like to confirm this with the committee this week.`,
      receivedAt: mins(60 * 26),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Robert Hayes",
      fromAddress: "robert.hayes@acmeindustries.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Project Falcon — Data Room Update",
      bodyText: `The data room for Project Falcon has been refreshed with the latest management accounts. Let us know if the buyer's advisors need anything further.`,
      receivedAt: mins(60 * 20),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Faircourt & Boyle LLP",
      fromAddress: "counsel@faircourtboyle.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Re: Project Falcon",
      bodyText: `Quick note on Project Falcon — buyer counsel flagged a minor point on the disclosure schedule, nothing urgent, we'll turn it around by tomorrow.`,
      receivedAt: mins(60 * 14),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Robert Hayes",
      fromAddress: "robert.hayes@acmeindustries.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Re: Project Falcon — Buyer Process",
      bodyText: `Buyer: Lockwood Capital has confirmed continued interest and will submit an indicative offer by next Friday. They also asked about management availability.`,
      receivedAt: mins(60 * 8),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Robert Hayes",
      fromAddress: "robert.hayes@acmeindustries.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Project Falcon — Final Bid Deadline",
      bodyText: `Reminder: the final bid deadline for Project Falcon is tomorrow. We need the updated bid instructions letter to buyers by end of day.`,
      receivedAt: mins(60 * 4),
    });
  }

  // Atlas deliberately receives NO backlog email — it's the seeded
  // Inactivity Engine demo scenario (PHASE4_DEAL_INTELLIGENCE.md §73/§75):
  // Run Scan must not touch it, so it still reads INACTIVE afterward.

  if (deals.orion) {
    const d = deals.orion;
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Cascade Health Partners",
      fromAddress: "deals@cascadehealthpartners.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Re: Project Orion — Indicative Offer",
      bodyText: `Following management meetings, we're pleased to submit an indicative offer of $420M enterprise value for Project Orion, up from our earlier range.`,
      receivedAt: mins(60 * 6),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: "Dana Whitcombe",
      fromAddress: "dana.whitcombe@meridianhealth.example",
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Re: Project Orion — Diligence Requests",
      bodyText: `We need the EBITDA bridge for Project Orion by Friday to keep the buyer's timetable on track. Also flagging: the buyer has concerns regarding valuation given the latest quarter.`,
      receivedAt: mins(60 * 5),
    });
  }

  if (deals.mgmtMeetingCandidate) {
    const d = deals.mgmtMeetingCandidate;
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: d.buyerCompanyName,
      fromAddress: `deals@${slug(d.buyerCompanyName)}.example`,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `Re: ${d.projectCodename} — Buyer Update`,
      bodyText: `Following our call, ${d.buyerCompanyName} would like to proceed to management meetings for ${d.projectCodename} next week to keep momentum going.`,
      receivedAt: mins(60 * 3),
    });
    emails.push({
      threadId: threadIdFor(d.id),
      fromName: d.buyerCompanyName,
      fromAddress: `deals@${slug(d.buyerCompanyName)}.example`,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `Re: ${d.projectCodename}`,
      bodyText: `Good discussion today with the deal team on ${d.projectCodename} — no action items, just a useful sync ahead of next steps.`,
      receivedAt: mins(60 * 2),
    });
  }

  // Unrelated "valuation" email — no thread link, no known client/company —
  // must not be confidently classified IB_RELEVANT (spec test 5).
  emails.push({
    newThreadSubject: "Valuation Modeling Training",
    fromName: "L&D Team",
    fromAddress: "learning@tattava-demo.bank",
    toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
    subject: "Reminder: Valuation Modeling Training",
    bodyText: `Don't forget the internal valuation training session Thursday at 10am in the London office. Please bring your laptop — we'll be working through a case study together.`,
    receivedAt: mins(60 * 40),
  });

  if (halcyon) {
    emails.push({
      newThreadSubject: `Potential engagement — ${halcyon.clientName}`,
      fromName: halcyon.name,
      fromAddress: halcyon.email,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `Potential engagement — ${halcyon.clientName}`,
      bodyText: `We at ${halcyon.clientName} are considering acquiring a regional competitor and would value your perspective on financing options. This is very preliminary — nothing has been decided internally yet.`,
      receivedAt: mins(60 * 50),
    });
  }

  return emails;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
}

const RELEVANT_UPDATE_BODIES = (codename: string, stageLabel: string) => [
  `Wanted to flag: the buyer has concerns regarding valuation on ${codename} following their latest internal review.`,
  `Timeline may need to be pushed on ${codename} — the counterparty's lender has asked for two more weeks of diligence.`,
  `Financing remains unresolved on ${codename}; the debt package is still being finalized with the syndicate.`,
  `Management is reconsidering the structure proposed for ${codename} — can we set up a call this week?`,
  `${codename} remains at ${stageLabel}. No material change since our last update, just confirming we're still on track.`,
];

const TASK_REQUEST_BODIES = (codename: string) => [
  `We need the updated financial model for ${codename} by Friday to circulate to the committee.`,
  `Could you send the revised term sheet for ${codename} by tomorrow? Counsel is waiting on it.`,
  `We need the buyer list for ${codename} by next Monday ahead of the outreach call.`,
];

const ROLE_MENTION_BODIES = (codename: string) => [
  (buyer: string) => `Buyer: ${buyer} has confirmed continued interest in ${codename} and will circulate comments on the draft agreement this week.`,
  (lawyer: string) => `The counsel: ${lawyer} sent over comments on the ${codename} purchase agreement — mostly minor points.`,
  (lender: string) => `Lender: ${lender} completed their credit committee review for ${codename} and expects to confirm terms shortly.`,
];

const INTERNAL_BANKER_BODIES = (codename: string, stageLabel: string) => [
  `Heads up on ${codename} — client called this morning, sounded positive about where things stand at ${stageLabel}.`,
  `Can you take a look at the latest valuation output for ${codename} before our internal committee tomorrow?`,
  `Following up internally on ${codename} — do we have a firm read on timeline from the client side?`,
];

const AMBIGUOUS_BODIES = [
  `Quick question on valuation methodology for the case study we're reviewing this week — is DCF or comps more appropriate here?`,
  `Following up on the acquisition discussion from the university guest lecture — any reading you'd recommend?`,
  `Our personal investment club is looking at a potential acquisition of a small local business — any general advice on structuring an offer?`,
  `Reviewing the mandate template for the internal training deck — is this still the current version?`,
];

const IRRELEVANT_SUBJECTS = ["Team lunch Friday?", "Office WiFi maintenance tonight", "Reminder: expense reports due", "Congrats on the new addition!", "Building access badge renewal"];
const IRRELEVANT_BODIES = [
  "Anyone free for team lunch this Friday? Thinking the new place on 5th.",
  "IT will be performing WiFi maintenance tonight from 11pm-1am, expect brief outages.",
  "Friendly reminder that expense reports for last month are due by end of week.",
  "Congratulations to the team on the big milestone — drinks after work to celebrate!",
  "Your building access badge is due for renewal — please stop by security this week.",
];

export function buildBacklogEmails(
  rng: Rng,
  allDeals: DealRef[],
  bankers: BankerRef[],
  now: Date,
  falconId?: string,
  atlasId?: string,
  orionId?: string,
  halcyon?: ContactRef,
): BacklogEmail[] {
  const bharath = bankers.find((b) => b.email.startsWith("bharath")) ?? bankers[0];
  const falcon = allDeals.find((d) => d.id === falconId);
  const atlas = allDeals.find((d) => d.id === atlasId);
  const orion = allDeals.find((d) => d.id === orionId);

  // Any M&A deal currently before "management_meetings" in its own
  // workflow — resolved dynamically rather than hardcoded, since which
  // filler deal lands there depends on the seeded RNG run.
  const mgmtMeetingCandidate = allDeals.find(
    (d) => d.bankingServiceId === "MA" && d.currentStageKey !== "management_meetings" && !["indicative_bids", "final_bids", "due_diligence", "documentation", "signing", "closing"].includes(d.currentStageKey),
  );

  const emails = curatedEmails(now, { falcon, atlas, orion, mgmtMeetingCandidate }, halcyon, bharath);

  const mins = (n: number) => new Date(now.getTime() - n * 60_000);
  let cursor = 60 * 55;

  function push(email: BacklogEmail) {
    cursor += randomInt(rng, 15, 90);
    emails.push({ ...email, receivedAt: mins(cursor) });
  }

  // Relevant deal-thread continuations across many deals — risk/timeline
  // signals, task requests, role mentions, internal-banker chatter. Atlas
  // is excluded here too (not just from curatedEmails) so the bulk loops
  // below don't undo the Inactivity Engine demo scenario by touching it.
  const contactEmailFor = (d: DealRef) => `contact@${slug(d.clientName)}.example`;
  const bulkDeals = allDeals.filter((d) => d.id !== atlasId);

  for (let i = 0; i < 25; i++) {
    const d = bulkDeals[i % bulkDeals.length];
    const body = pick(rng, RELEVANT_UPDATE_BODIES(d.projectCodename, "current stage"));
    push({
      threadId: threadIdFor(d.id),
      fromName: d.clientName,
      fromAddress: contactEmailFor(d),
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `Re: ${d.projectCodename} — Update`,
      bodyText: body,
      receivedAt: now,
    });
  }

  for (let i = 0; i < 15; i++) {
    const d = bulkDeals[(i + 3) % bulkDeals.length];
    const body = pick(rng, TASK_REQUEST_BODIES(d.projectCodename));
    push({
      threadId: threadIdFor(d.id),
      fromName: d.clientName,
      fromAddress: contactEmailFor(d),
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `${d.projectCodename} — Action Needed`,
      bodyText: body,
      receivedAt: now,
    });
  }

  for (let i = 0; i < 10; i++) {
    const d = bulkDeals[(i + 7) % bulkDeals.length];
    const roleFn = pick(rng, ROLE_MENTION_BODIES(d.projectCodename));
    push({
      threadId: threadIdFor(d.id),
      fromName: d.clientName,
      fromAddress: contactEmailFor(d),
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `Re: ${d.projectCodename} — Counterparty Update`,
      bodyText: roleFn(d.buyerCompanyName || "the counterparty"),
      receivedAt: now,
    });
  }

  for (let i = 0; i < 15; i++) {
    const d = bulkDeals[(i + 11) % bulkDeals.length];
    const sender = bankers[(i + 2) % bankers.length];
    const body = pick(rng, INTERNAL_BANKER_BODIES(d.projectCodename, "current stage"));
    push({
      threadId: threadIdFor(d.id),
      fromName: sender.name,
      fromAddress: sender.email,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: `${d.projectCodename} — internal note`,
      bodyText: body,
      receivedAt: now,
    });
  }

  for (let i = 0; i < 10; i++) {
    const body = pick(rng, AMBIGUOUS_BODIES);
    push({
      newThreadSubject: `Ambiguous ${i}`,
      fromName: "External Contact",
      fromAddress: `contact${i}@unrelated-example.com`,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: "Quick question",
      bodyText: body,
      receivedAt: now,
    });
  }

  for (let i = 0; i < 5; i++) {
    push({
      newThreadSubject: IRRELEVANT_SUBJECTS[i % IRRELEVANT_SUBJECTS.length],
      fromName: bankers[(i + 1) % bankers.length].name,
      fromAddress: bankers[(i + 1) % bankers.length].email,
      toAddress: bharath?.email ?? "bharath.vijay@tattava-demo.bank",
      subject: IRRELEVANT_SUBJECTS[i % IRRELEVANT_SUBJECTS.length],
      bodyText: IRRELEVANT_BODIES[i % IRRELEVANT_BODIES.length],
      receivedAt: now,
    });
  }

  return emails;
}
