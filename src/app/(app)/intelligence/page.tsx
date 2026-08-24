import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntelligenceFeedItem } from "@/components/intelligence/feed-item";
import { EmptyState } from "@/components/shared/empty-state";
import { intelligenceRepository } from "@/lib/data";
import type { IntelligenceCategory } from "@/types/domain";
import { Radar } from "lucide-react";

const categories: { value: IntelligenceCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DEAL_CHANGE", label: "Deal Changes" },
  { value: "CLIENT_ACTIVITY", label: "Client Activity" },
  { value: "TASK", label: "Tasks" },
  { value: "OPPORTUNITY", label: "Opportunities" },
  { value: "RISK", label: "Risks" },
  { value: "IMPORTANT_EMAIL", label: "Important Emails" },
];

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const items = await intelligenceRepository.list();
  const initial = categories.some((c) => c.value === sp.category) ? sp.category! : "ALL";

  return (
    <div className="pb-10">
      <PageHeader
        title="Intelligence Feed"
        description="Every meaningful change Tattava detected in your inbox, with source evidence and confidence."
      />

      <div className="px-8 pt-5">
        <Tabs defaultValue={initial}>
          <TabsList className="flex-wrap">
            {categories.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((c) => {
            const filtered = c.value === "ALL" ? items : items.filter((i) => i.category === c.value);
            return (
              <TabsContent key={c.value} value={c.value}>
                <Card className="gap-0">
                  {filtered.length === 0 ? (
                    <div className="px-5 py-6">
                      <EmptyState icon={Radar} title="Nothing here yet" />
                    </div>
                  ) : (
                    <div>
                      {filtered.map((item) => (
                        <IntelligenceFeedItem key={item.id} item={item} showReviewActions />
                      ))}
                    </div>
                  )}
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
