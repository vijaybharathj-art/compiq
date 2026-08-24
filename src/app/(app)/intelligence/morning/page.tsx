import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { BriefingView } from "@/components/intelligence/briefing-view";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { generateMorningBriefing, getLatestBriefing } from "@/lib/intelligence/briefing";
import { generateMorningBriefingAction } from "@/lib/actions/intelligence-actions";
import { parseBriefingContent, parseBriefingSummary } from "@/lib/intelligence/briefing-schema";
import { Sunrise } from "lucide-react";

function isToday(date: Date, now: Date) {
  return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

export default async function MorningBriefingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const now = DEMO_NOW;

  let briefing = userId ? await getLatestBriefing(DEMO_ORG_ID, userId, "MORNING") : null;
  if (userId && (!briefing || !isToday(briefing.date, now))) {
    briefing = await generateMorningBriefing(DEMO_ORG_ID, userId, now);
  }

  return (
    <div className="pb-10">
      <PageHeader title="Morning Briefing" description="Generated from real database events — never a freestanding summary." />
      <IntelligenceSubNav />

      {!briefing ? (
        <div className="px-8 pt-8">
          <EmptyState icon={Sunrise} title="No briefing yet" description="Sign in to generate your morning briefing." />
        </div>
      ) : (
        <BriefingView
          title="Good Morning"
          greeting={`Good morning, ${(session?.user?.name ?? "there").split(" ")[0]}.`}
          dateLabel={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          summary={parseBriefingSummary(briefing.summary)}
          content={parseBriefingContent(briefing.content)}
          narrationFailed={briefing.status === "FAILED"}
          generateAction={generateMorningBriefingAction}
          generateLabel="Regenerate"
        />
      )}
    </div>
  );
}
