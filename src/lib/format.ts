import type { Money } from "@/types/domain";

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMoney(money?: Money | null, opts?: { compact?: boolean }) {
  if (!money) return "—";
  const amount = money.amountMinorUnits / 100;
  if (opts?.compact ?? true) {
    return `${currencySymbol(money.currency)}${compactUsdFormatter.format(amount)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function currencySymbol(currency: string) {
  switch (currency) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return `${currency} `;
  }
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateShort(iso?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function relativeTimeFromNow(iso: string, now: Date = new Date()) {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(iso);
}

export function daysSince(iso: string, now: Date = new Date()) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}

export function formatEnumLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
