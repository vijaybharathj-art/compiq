import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { BriefingView } from "@/components/intelligence/briefing-view";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { generateEveningBriefing, getLatestBriefing } from "@/lib/intelligence/briefing";
import { generateEveningBriefingAction } from "@/lib/actions/intelligence-actions";
import { parseBriefingContent, parseBriefingSummary } from "@/lib/intelligence/briefing-schema";
import { Moon } from "lucide-react";

function isToday(date: Date, now: Date) {
  return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

export default async function EveningBriefingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const now = DEMO_NOW;

  let briefing = userId ? await getLatestBriefing(DEMO_ORG_ID, userId, "EVENING") : null;
  if (userId && (!briefing || !isToday(briefing.date, now))) {
    briefing = await generateEveningBriefing(DEMO_ORG_ID, userId, now);
  }

  return (
    <div className="pb-10">
      <PageHeader title="Evening Briefing" description="What happened today, and what's coming up tomorrow." />
      <IntelligenceSubNav />

      {!briefing ? (
        <div className="px-8 pt-8">
          <EmptyState icon={Moon} title="No briefing yet" description="Sign in to generate your evening briefing." />
        </div>
      ) : (
        <BriefingView
          title="End of Day"
          greeting="Here's what happened today."
          dateLabel={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          summary={parseBriefingSummary(briefing.summary)}
          content={parseBriefingContent(briefing.content)}
          generateAction={generateEveningBriefingAction}
          generateLabel="Regenerate"
        />
      )}
    </div>
  );
}
