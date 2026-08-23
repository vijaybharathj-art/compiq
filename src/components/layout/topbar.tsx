"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bankers, CURRENT_USER_ID } from "@/lib/data/fixtures/bankers";
import { initials } from "@/lib/format";

export function Topbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const mounted = useMounted();
  const currentUser = bankers.find((b) => b.id === CURRENT_USER_ID)!;

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-5">
      <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals, clients, people…"
          className="h-8 pl-8 text-sm bg-surface-raised/60"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>

        <Button variant="ghost" size="icon" className="size-8" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface-raised">
              <Avatar className="size-7">
                <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">
                {currentUser.name.split(" ")[0]}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{currentUser.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/integrations">Integrations</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Sign out (demo mode)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
