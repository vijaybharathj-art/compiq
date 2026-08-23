import { Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const providers = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Connect a Google Workspace mailbox via the Gmail API.",
  },
  {
    id: "outlook",
    name: "Microsoft Outlook",
    description: "Connect a Microsoft 365 mailbox via the Microsoft Graph API.",
  },
];

export default function IntegrationsPage() {
  return (
    <div className="pb-10">
      <PageHeader
        title="Integrations"
        description="Connect a mailbox to let Tattava build deal intelligence from your inbox."
      />

      <div className="grid grid-cols-1 gap-4 px-8 pt-5 md:grid-cols-2">
        {providers.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
                <Mail className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm">{p.name}</CardTitle>
                <CardDescription className="mt-1">{p.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <Badge variant="outline">Planned integration — not connected</Badge>
              <Button size="sm" variant="secondary" disabled>
                Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="px-8 pt-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Data handling</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tattava never requests or stores your mailbox password. Email content is processed
            solely to build your organization&apos;s deal intelligence and is never used for
            model training. See <code className="text-xs">SECURITY.md</code> and{" "}
            <code className="text-xs">AI_EXTRACTION_SPEC.md</code> for the full data policy. This
            build runs entirely in Demo Mode — no mailbox is connected and no external network
            calls are made.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
