import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { referenceRepository } from "@/lib/data";
import { organization } from "@/lib/data/fixtures/organization";
import { auth } from "@/lib/auth/config";
import { logoutAction } from "@/lib/auth/actions";
import { updateNotificationPreferences } from "@/lib/actions/mutations";
import { formatEnumLabel, initials } from "@/lib/format";

const CONFIDENCE_POLICY = [
  { range: "> 90%", behavior: "Auto-apply (if org policy allows), logged to Audit Log" },
  { range: "70 – 90%", behavior: "Suggested update — Accept / Reject / Review" },
  { range: "< 70%", behavior: "No write — surfaced as “Potential information detected” only" },
] as const;

const NOTIFICATION_OPTIONS = [
  { key: "notifyDealChanges", label: "Deal changes", description: "Stage moves, value updates, mandate changes." },
  { key: "notifyRiskAlerts", label: "Risk alerts", description: "Deals flagged at-risk or requiring attention." },
  { key: "notifyTaskReminders", label: "Task reminders", description: "Tasks due today or overdue." },
  { key: "notifyDailyDigest", label: "Daily digest", description: "A morning summary of what changed across your deal book." },
] as const;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const [bankers, session] = await Promise.all([referenceRepository.bankers(), auth()]);
  const currentUser = bankers.find((b) => b.id === session?.user?.id) ?? bankers[0]!;
  const preferences = session?.user?.id
    ? await referenceRepository.notificationPreferences(session.user.id)
    : await referenceRepository.notificationPreferences(currentUser.id);
  const aiProvider = process.env.AI_PROVIDER ?? "demo";

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
              <Fact label="Team" value={formatEnumLabel(currentUser.team)} />
              <Fact label="Auth provider" value={<Badge variant="outline">Demo account</Badge>} />
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
                  <Badge variant="outline">{formatEnumLabel(b.team)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Settings</CardTitle>
            <CardDescription>
              How Tattava&apos;s AI extraction layer is configured for this organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border-subtle">
            <Fact
              label="Active provider"
              value={
                <Badge variant="accent">
                  {aiProvider === "demo"
                    ? "Demo (rule-based)"
                    : formatEnumLabel(aiProvider)}
                </Badge>
              }
            />
            <Fact
              label="Anthropic"
              value={<Badge variant="outline">Planned — no API key configured</Badge>}
            />
            <Fact
              label="OpenAI"
              value={<Badge variant="outline">Planned — no API key configured</Badge>}
            />
          </CardContent>
          <div className="px-5 pb-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Confidence policy</p>
            <div className="overflow-hidden rounded-md border border-border-subtle">
              {CONFIDENCE_POLICY.map((row) => (
                <div
                  key={row.range}
                  className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 text-xs last:border-0"
                >
                  <span className="w-20 shrink-0 font-medium tabular-nums text-foreground">
                    {row.range}
                  </span>
                  <span className="text-muted-foreground">{row.behavior}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose what shows up in your notification bell.</CardDescription>
          </CardHeader>
          <form action={updateNotificationPreferences}>
            <CardContent className="flex flex-col gap-3">
              {NOTIFICATION_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  htmlFor={opt.key}
                  className="flex cursor-pointer items-start gap-3 rounded-md p-1.5 hover:bg-surface-raised"
                >
                  <Checkbox
                    id={opt.key}
                    name={opt.key}
                    defaultChecked={preferences[opt.key]}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </label>
              ))}
            </CardContent>
            <div className="flex justify-end px-5 pb-5">
              <Button type="submit" size="sm">
                Save preferences
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border-subtle">
            <Fact label="Sign-in method" value={<Badge variant="outline">Demo account (Credentials)</Badge>} />
            <Fact label="Password" value="Not applicable — no password is collected or stored" />
            <Fact
              label="Google / Microsoft OAuth"
              value={<Badge variant="outline">Planned — Phase 2</Badge>}
            />
            <Fact label="Session" value="JWT session, active on this device" />
          </CardContent>
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
            <p className="text-xs text-muted-foreground">
              Full history of security-relevant actions lives in the{" "}
              <Link href="/audit-log" className="text-accent hover:underline">
                Audit Log
              </Link>
              .
            </p>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
