import type { ItemStatus, JewelryItem, Settings } from "./types";

/**
 * The prototype's "today".
 *
 * Fixed rather than `new Date()` on purpose: this app is statically exported, so
 * HTML is generated at build time. A real clock would render different output at
 * build and at hydration, producing mismatch warnings and flickering badges.
 * Swap this for the real date once data comes from Supabase and rendering is
 * genuinely client-side.
 */
export const DEMO_TODAY = "2026-08-03";

/**
 * Formatting configuration, set once by LanguageProvider when the language
 * changes. Held at module scope rather than passed through every call site:
 * changing the language re-renders the whole tree, so formatters always read the
 * current value during that render.
 */
let config = { locale: "en-IN", gram: "g" };

export function configureFormatting(next: Partial<typeof config>): void {
  config = { ...config, ...next };
}

export function today(): string {
  return DEMO_TODAY;
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString(config.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(config.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatWeight(grams?: number): string {
  if (grams == null) return "—";
  return `${grams.toFixed(1)} ${config.gram}`;
}

export function formatMoney(amount?: number, currency = "INR"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Compact form for stat tiles: ₹12.4L, ₹1.2Cr. */
export function formatMoneyShort(amount: number, currency = "INR"): string {
  const symbol = currency === "INR" ? "₹" : "";
  if (currency !== "INR") return formatMoney(amount, currency);
  if (amount >= 10_000_000) return `${symbol}${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `${symbol}${(amount / 100_000).toFixed(2)} L`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)} K`;
  return `${symbol}${amount.toFixed(0)}`;
}

/**
 * Estimated value from the manually maintained gold rate.
 * Karat purity is converted to a fraction of pure gold: 22K → 22/24.
 */
export function estimateValue(item: JewelryItem, settings: Settings): number {
  return item.netGoldWeight * (item.purity / 24) * settings.goldRatePerGram24k;
}

/** Tailwind classes per status, used by the Badge component. */
export const STATUS_TONE: Record<ItemStatus, string> = {
  in_locker: "bg-ok/10 text-ok border-ok/25",
  with_member: "bg-gold/10 text-gold-deep border-gold/30",
  in_transit: "bg-info/10 text-info border-info/25",
  at_jeweler: "bg-warn/10 text-warn border-warn/30",
  lost: "bg-danger/10 text-danger border-danger/30",
};

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
