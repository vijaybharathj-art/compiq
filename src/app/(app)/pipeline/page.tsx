import { PageHeader } from "@/components/shared/page-header";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { dealRepository, bankingServices } from "@/lib/data";

export default async function PipelinePage() {
  const deals = await dealRepository.list();

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Deal flow by stage, per banking service workflow."
      />
      <PipelineBoard deals={deals} bankingServices={bankingServices} initialService="MA" />
    </div>
  );
}
