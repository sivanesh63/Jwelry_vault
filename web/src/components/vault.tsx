"use client";

/** Domain-specific presentational components shared across screens. */

import Link from "next/link";
import {
  AlertTriangle,
  Circle,
  CircleDot,
  Coins,
  Gem,
  Link2,
  Sparkles,
  Watch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/store";
import {
  STATUS_LABEL,
  STATUS_TONE,
  daysBetween,
  estimateValue,
  formatMoneyShort,
  formatWeight,
  relativeDays,
  today,
} from "@/lib/format";
import type { JewelryCategory, JewelryItem } from "@/lib/types";
import { Badge } from "./ui";

const CATEGORY_ICON: Record<JewelryCategory, typeof Gem> = {
  necklace: Sparkles,
  bangle: Circle,
  ring: CircleDot,
  earring: Gem,
  chain: Link2,
  bracelet: Watch,
  anklet: Circle,
  coin: Coins,
  other: Gem,
};

export const CATEGORY_LABEL: Record<JewelryCategory, string> = {
  necklace: "Necklace",
  bangle: "Bangle",
  ring: "Ring",
  earring: "Earring",
  chain: "Chain",
  bracelet: "Bracelet",
  anklet: "Anklet",
  coin: "Coin",
  other: "Other",
};

/**
 * Photo placeholder.
 *
 * Real photos land here once Supabase Storage is wired in; until then a
 * deterministic gradient keyed off the item id keeps the list visually
 * distinguishable without shipping fake stock imagery.
 */
export function PhotoTile({
  item,
  className,
}: {
  item: JewelryItem;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[item.category];
  const hue = hashHue(item.id);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border",
        className,
      )}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 45% 88%), hsl(${(hue + 40) % 360} 40% 78%))`,
      }}
    >
      <Icon className="size-1/3 text-black/35" strokeWidth={1.5} />
    </div>
  );
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function StatusBadge({ item }: { item: JewelryItem }) {
  return <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>;
}

/** Red "overdue" or amber "due soon" pill; renders nothing when neither applies. */
export function DueBadge({ item }: { item: JewelryItem }) {
  const { state } = useVault();
  if (!item.expectedReturnOn) return null;
  if (item.status !== "with_member" && item.status !== "at_jeweler") return null;

  const delta = daysBetween(today(), item.expectedReturnOn);
  if (delta < 0) {
    return (
      <Badge tone="bg-danger/10 text-danger border-danger/30">
        <AlertTriangle className="size-3" />
        Overdue {Math.abs(delta)}d
      </Badge>
    );
  }
  if (delta <= state.settings.dueSoonLeadDays) {
    return (
      <Badge tone="bg-warn/10 text-warn border-warn/30">
        Due {relativeDays(today(), item.expectedReturnOn)}
      </Badge>
    );
  }
  return null;
}

/** Row used in the jewelry list and in most pickers. */
export function ItemRow({
  item,
  href,
  right,
  selectable,
  selected,
  onToggle,
}: {
  item: JewelryItem;
  href?: string;
  right?: React.ReactNode;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { state, locationOf } = useVault();
  const value = estimateValue(item, state.settings);

  const body = (
    <>
      <PhotoTile item={item} className="size-12" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{item.name}</p>
          <DueBadge item={item} />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {CATEGORY_LABEL[item.category]} · {formatWeight(item.grossWeight)} · {item.purity}K
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">{locationOf(item)}</p>
      </div>
      {right ?? (
        <div className="hidden shrink-0 text-right sm:block">
          <p className="tabular text-sm font-medium">{formatMoneyShort(value)}</p>
          <StatusBadge item={item} />
        </div>
      )}
    </>
  );

  const shared = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors";

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(shared, selected ? "bg-gold-soft" : "hover:bg-surface-2")}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border",
            selected ? "border-gold bg-gold text-white" : "border-border",
          )}
          aria-hidden="true"
        >
          {selected ? "✓" : ""}
        </span>
        {body}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cn(shared, "hover:bg-surface-2")}>
        {body}
      </Link>
    );
  }

  return <div className={shared}>{body}</div>;
}

/** Dashboard metric tile. */
export function StatTile({
  label,
  value,
  sub,
  tone,
  href,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger" | "warn";
  href?: string;
  icon?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "tabular mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted">{sub}</p> : null}
    </>
  );

  const className = cn(
    "block rounded-xl border border-border bg-surface p-4 transition-colors",
    href && "hover:bg-surface-2",
  );

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** Key/value line used on detail screens. */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="tabular min-w-0 truncate text-right text-sm font-medium">{value}</span>
    </div>
  );
}
