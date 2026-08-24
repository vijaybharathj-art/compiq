import type { Rng } from "./rng";
import { pick } from "./rng";

export interface EmailTemplateContext {
  codename: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  bankerName: string;
  bankerEmail: string;
  stageLabel: string;
  valueLabel: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  kind: "kickoff" | "update" | "request" | "milestone" | "risk";
}

const KICKOFF_SUBJECTS = (c: EmailTemplateContext) => [
  `${c.codename} — kicking off`,
  `Introduction — ${c.codename}`,
  `${c.codename}: initial scoping call`,
];

const KICKOFF_BODIES = (c: EmailTemplateContext) => [
  `Thanks for the call earlier. As discussed, we're comfortable proceeding with ${c.codename} and would like your team to lead the process. Happy to set up a working session this week.`,
  `Following our conversation, ${c.clientName} would like to move forward with ${c.codename}. Let us know what you need from our side to get started.`,
];

const UPDATE_SUBJECTS = (c: EmailTemplateContext) => [
  `RE: ${c.codename} — status update`,
  `${c.codename}: progress check-in`,
];

const UPDATE_BODIES = (c: EmailTemplateContext) => [
  `Quick update on ${c.codename} — we're now at the ${c.stageLabel} stage. Overall the process is tracking to plan at an indicative value around ${c.valueLabel}.`,
  `Wanted to give you a heads up: ${c.codename} has moved into ${c.stageLabel}. Let's sync early next week to align on next steps.`,
];

const REQUEST_SUBJECTS = (c: EmailTemplateContext) => [
  `${c.codename} — information request`,
  `RE: ${c.codename} — need your input`,
];

const REQUEST_BODIES = (c: EmailTemplateContext) => [
  `Could you send over the latest materials for ${c.codename}? We'd like to review before our next internal committee meeting.`,
  `One of the counterparties on ${c.codename} has asked for additional detail before they can proceed. Can we discuss timing this week?`,
];

const MILESTONE_SUBJECTS = (c: EmailTemplateContext) => [
  `${c.codename} — milestone reached`,
  `${c.codename}: next steps confirmed`,
];

const MILESTONE_BODIES = (c: EmailTemplateContext) => [
  `Good news — ${c.codename} has cleared the ${c.stageLabel} milestone. Value guidance remains around ${c.valueLabel}. Let's discuss timeline for the next phase.`,
  `Confirming ${c.codename} is now in ${c.stageLabel}. This is ahead of where we expected to be at this point.`,
];

const RISK_SUBJECTS = (c: EmailTemplateContext) => [
  `RE: ${c.codename} — timing concern`,
  `${c.codename}: flagging a delay`,
];

const RISK_BODIES = (c: EmailTemplateContext) => [
  `Wanted to flag that we haven't heard back from the counterparty on ${c.codename} in over a week. Might be worth a follow-up call.`,
  `There's some internal hesitation on our side about the current terms for ${c.codename}. Can we find time to talk through options?`,
];

export function generateFillerEmail(
  rng: Rng,
  kind: GeneratedEmail["kind"],
  ctx: EmailTemplateContext,
): GeneratedEmail {
  const subjectPool =
    kind === "kickoff"
      ? KICKOFF_SUBJECTS(ctx)
      : kind === "update"
        ? UPDATE_SUBJECTS(ctx)
        : kind === "request"
          ? REQUEST_SUBJECTS(ctx)
          : kind === "milestone"
            ? MILESTONE_SUBJECTS(ctx)
            : RISK_SUBJECTS(ctx);
  const bodyPool =
    kind === "kickoff"
      ? KICKOFF_BODIES(ctx)
      : kind === "update"
        ? UPDATE_BODIES(ctx)
        : kind === "request"
          ? REQUEST_BODIES(ctx)
          : kind === "milestone"
            ? MILESTONE_BODIES(ctx)
            : RISK_BODIES(ctx);

  return { subject: pick(rng, subjectPool), body: pick(rng, bodyPool), kind };
}

export const FILLER_TASK_TITLES = [
  "Send updated materials to client",
  "Circulate revised timeline",
  "Follow up on outstanding diligence items",
  "Prepare committee memo",
  "Schedule internal review call",
  "Confirm counterparty availability",
  "Draft summary for lead banker",
  "Chase signature on engagement letter",
  "Update valuation model",
  "Coordinate with legal on documentation",
];

export const MILESTONE_NOTE_TEMPLATES = [
  (codename: string) => `${codename} entered a new phase following counterparty engagement.`,
  (codename: string) => `Internal review completed for ${codename}; proceeding as planned.`,
  (codename: string) => `Materials circulated to relevant stakeholders on ${codename}.`,
];
