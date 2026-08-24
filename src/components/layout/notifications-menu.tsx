import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { notificationRepository } from "@/lib/data";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/mutations";
import { relativeTimeFromNow } from "@/lib/format";

export async function NotificationsMenu({ userId }: { userId: string }) {
  const notifications = await notificationRepository.listForUser(userId);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label="Notifications">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-negative text-[9px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-xs text-accent hover:underline">
                Mark all read
              </button>
            </form>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-2">
            <EmptyState icon={Bell} title="No notifications" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-1">
                <DropdownMenuItem asChild className="flex-1 flex-col items-start gap-0.5 py-2">
                  <Link href={n.linkHref ?? "#"}>
                    <div className="flex w-full items-center gap-2">
                      {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTimeFromNow(n.createdAt, new Date("2026-08-23T18:00:00Z"))}
                    </span>
                  </Link>
                </DropdownMenuItem>
                {!n.readAt && (
                  <form action={markNotificationRead.bind(null, n.id)} className="pt-2 pr-1">
                    <button
                      type="submit"
                      className="text-[10px] text-muted-foreground hover:text-accent"
                      title="Mark as read"
                    >
                      Read
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
