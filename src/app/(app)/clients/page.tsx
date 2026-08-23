import { PageHeader } from "@/components/shared/page-header";
import { ClientsTable } from "@/components/clients/clients-table";
import { clientRepository } from "@/lib/data";

export default async function ClientsPage() {
  const clients = await clientRepository.list();

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Relationship intelligence across every client the firm covers."
      />
      <ClientsTable clients={clients} />
    </div>
  );
}
