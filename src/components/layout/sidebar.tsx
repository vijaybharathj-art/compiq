"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNav, systemNav, teamsNav } from "./nav-config";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

interface SidebarUser {
  name: string;
  role: string;
  team: string;
  organization: string;
}

function NavSection({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">
      {label}
    </div>
  );
}

export function SidebarBrand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-border px-4">
      <div className="flex size-6 items-center justify-center rounded-sm bg-accent text-accent-foreground text-xs font-bold">
        T
      </div>
      <span className="text-sm font-semibold tracking-tight">TATTAVA</span>
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto pb-4">
      <div className="px-2 pt-2">
        {primaryNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent/12 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <NavSection label="Teams" />
      <div className="px-2">
        {teamsNav.map((team) => {
          const href = `/deals?service=${team.code}`;
          const active = pathname === "/deals";
          return (
            <Link
              key={team.code}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                active && "text-foreground",
              )}
            >
              <span className="ml-0.5 size-1.5 shrink-0 rounded-full bg-border-subtle" />
              {team.label}
            </Link>
          );
        })}
      </div>

      <NavSection label="System" />
      <div className="px-2">
        {systemNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent/12 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SidebarUserFooter({ user }: { user: SidebarUser }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-3 py-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.role} · {user.organization}
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user?: SidebarUser }) {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <SidebarBrand />
      <SidebarNav />
      {user && <SidebarUserFooter user={user} />}
    </aside>
  );
}
