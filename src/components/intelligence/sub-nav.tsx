"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/intelligence", label: "What Changed" },
  { href: "/intelligence/morning", label: "Morning Briefing" },
  { href: "/intelligence/evening", label: "Evening Briefing" },
  { href: "/intelligence/review", label: "AI Review" },
  { href: "/intelligence/scan", label: "Scan" },
];

export function IntelligenceSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 px-8 pt-3">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent/12 font-medium text-foreground"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
