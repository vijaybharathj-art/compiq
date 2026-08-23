import { PageHeader } from "@/components/shared/page-header";
import { DealsTable } from "@/components/deals/deals-table";
import { dealRepository, bankingServices } from "@/lib/data";
import type { BankingServiceCode } from "@/types/domain";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const sp = await searchParams;
  const deals = await dealRepository.list();
  const initialService = sp.service as BankingServiceCode | undefined;

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Every active mandate across the firm, kept current by Tattava's email intelligence."
      />
      <DealsTable deals={deals} bankingServices={bankingServices} initialService={initialService} />
    </div>
  );
}
