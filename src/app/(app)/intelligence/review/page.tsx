import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { ReviewItem } from "@/components/intelligence/review-item";
import { getPendingSuggestions } from "@/lib/pipeline/queries";
import { DEMO_ORG_ID } from "@/lib/constants";
import { ShieldCheck } from "lucide-react";

export default async function AiReviewPage() {
  const suggestions = await getPendingSuggestions(DEMO_ORG_ID);

  return (
    <div className="pb-10">
      <PageHeader
        title="AI Review"
        description="AI-suggested changes between 70–89% confidence wait here for a banker to accept, reject, or inspect the source email."
      />
      <IntelligenceSubNav />

      <div className="flex flex-col gap-3 px-8 pt-5">
        {suggestions.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Nothing pending review" description="Run a scan to generate new suggestions." />
        ) : (
          suggestions.map((s) => <ReviewItem key={s.id} suggestion={s} />)
        )}
      </div>
    </div>
  );
}
