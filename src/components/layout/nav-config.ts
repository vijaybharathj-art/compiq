import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Briefcase,
  GitMerge,
  Users,
  CheckSquare,
  Radar,
  Calendar,
  Search,
  Settings,
  Plug,
  ScrollText,
} from "lucide-react";
import type { BankingServiceCode } from "@/types/domain";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Deals", href: "/deals", icon: Briefcase },
  { label: "Pipeline", href: "/pipeline", icon: GitMerge },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Intelligence", href: "/intelligence", icon: Radar },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Search", href: "/search", icon: Search },
];

export const teamsNav: { label: string; code: BankingServiceCode }[] = [
  { label: "M&A", code: "MA" },
  { label: "ECM", code: "ECM" },
  { label: "DCM", code: "DCM" },
  { label: "Leveraged Finance", code: "LEVERAGED_FINANCE" },
  { label: "Restructuring", code: "RESTRUCTURING" },
  { label: "Private Capital", code: "PRIVATE_CAPITAL" },
  { label: "Advisory", code: "FINANCIAL_ADVISORY" },
];

export const systemNav: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Integrations", href: "/integrations", icon: Plug },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
];
