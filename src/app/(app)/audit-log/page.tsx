import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditLogRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export default async function AuditLogPage() {
  const entries = await auditLogRepository.list();

  return (
    <div className="pb-10">
      <PageHeader
        title="Audit Log"
        description="Every AI auto-applied change and every human accept/reject decision, in order."
      />
      <div className="px-8 pt-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDateTime(e.occurredAt)}
                </TableCell>
                <TableCell className="font-medium">{e.actorName}</TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell>
                  {e.entityHref ? (
                    <Link href={e.entityHref} className="text-accent hover:underline">
                      {e.entityLabel}
                    </Link>
                  ) : (
                    e.entityLabel
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.metadata ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
