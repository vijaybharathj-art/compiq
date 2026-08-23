import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { bankers, CURRENT_USER_ID } from "@/lib/data/fixtures/bankers";
import { organization } from "@/lib/data/fixtures/organization";
import { initials } from "@/lib/format";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const currentUser = bankers.find((b) => b.id === CURRENT_USER_ID)!;

  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Your profile and organization configuration." />

      <div className="grid grid-cols-1 gap-4 px-8 pt-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 pb-3">
              <Avatar className="size-10">
                <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground">{currentUser.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser.title}</p>
              </div>
            </div>
            <div className="divide-y divide-border-subtle">
              <Fact label="Email" value={currentUser.email} />
              <Fact label="Team" value={currentUser.team.replaceAll("_", " ")} />
              <Fact label="Auth provider" value={<Badge variant="outline">Google (demo)</Badge>} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border-subtle">
            <Fact label="Name" value={organization.name} />
            <Fact label="Plan" value={<Badge variant="accent">{organization.plan}</Badge>} />
            <Fact label="Members" value={bankers.length} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ul>
              {bankers.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      <AvatarFallback>{initials(b.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.title}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{b.team.replaceAll("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
