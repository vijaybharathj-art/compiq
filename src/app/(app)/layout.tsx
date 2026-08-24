import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { auth } from "@/lib/auth/config";
import { referenceRepository } from "@/lib/data";
import { organization } from "@/lib/data/fixtures/organization";
import { formatEnumLabel } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, bankers] = await Promise.all([auth(), referenceRepository.bankers()]);
  const currentBanker = bankers.find((b) => b.id === session?.user?.id);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        user={
          currentBanker
            ? {
                name: currentBanker.name,
                role: currentBanker.title,
                team: formatEnumLabel(currentBanker.team),
                organization: organization.name,
              }
            : undefined
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={session?.user}
          notifications={session?.user ? <NotificationsMenu userId={session.user.id} /> : null}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
