"use client";

import { useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { activeItems, STATUS_ORDER, useVault } from "@/lib/store";
import { STATUS_LABEL, estimateValue, formatMoneyShort, formatWeight } from "@/lib/format";
import { Card, EmptyState, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { CATEGORY_LABEL, ItemRow } from "@/components/vault";
import type { ItemStatus, JewelryCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "name" | "weight" | "value" | "recent";

export default function JewelryListPage() {
  const { state, userById, locationOf } = useVault();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ItemStatus | "all">("all");
  const [category, setCategory] = useState<JewelryCategory | "all">("all");
  const [holder, setHolder] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [showFilters, setShowFilters] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = activeItems(state);

    if (q) {
      // Search spans the fields the plan called for: name, category, purity,
      // hallmark, holder and location.
      list = list.filter((item) => {
        const haystack = [
          item.name,
          CATEGORY_LABEL[item.category],
          item.hallmarkNo ?? "",
          item.jeweler ?? "",
          item.notes ?? "",
          `${item.purity}k`,
          `${item.grossWeight}`,
          locationOf(item),
          userById(item.ownerId)?.displayName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (status !== "all") list = list.filter((i) => i.status === status);
    if (category !== "all") list = list.filter((i) => i.category === category);
    if (holder !== "all") {
      list = list.filter((i) => i.currentHolderId === holder || i.ownerId === holder);
    }

    const sorted = list.slice();
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "weight":
        sorted.sort((a, b) => b.grossWeight - a.grossWeight);
        break;
      case "value":
        sorted.sort((a, b) => estimateValue(b, state.settings) - estimateValue(a, state.settings));
        break;
      case "recent":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }
    return sorted;
  }, [state, query, status, category, holder, sort, locationOf, userById]);

  const totalWeight = items.reduce((s, i) => s + i.grossWeight, 0);
  const totalValue = items.reduce((s, i) => s + estimateValue(i, state.settings), 0);
  const filtersActive = status !== "all" || category !== "all" || holder !== "all";

  return (
    <>
      <PageHeader
        title="Jewelry"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · ${formatWeight(totalWeight)} · ${formatMoneyShort(totalValue)}`}
        action={
          <LinkButton href="/jewelry/edit/" variant="primary">
            <Plus className="size-4" />
            Add
          </LinkButton>
        }
      />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, hallmark, holder, location…"
            className="pl-9"
            type="search"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
            filtersActive || showFilters
              ? "border-gold bg-gold-soft text-gold-deep"
              : "border-border bg-surface text-muted hover:bg-surface-2",
          )}
          aria-label="Filters"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>

      {showFilters ? (
        <Card className="mb-3 grid gap-3 p-3 sm:grid-cols-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus | "all")}>
            <option value="all">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as JewelryCategory | "all")}
          >
            <option value="all">Any category</option>
            {(Object.keys(CATEGORY_LABEL) as JewelryCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select value={holder} onChange={(e) => setHolder(e.target.value)}>
            <option value="all">Anyone</option>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="weight">Heaviest</option>
            <option value="value">Most valuable</option>
          </Select>
        </Card>
      ) : null}

      {/* Locker summary chips give a quick sense of distribution. */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {state.lockers.map((locker) => {
          const count = activeItems(state).filter((i) => i.currentLockerId === locker.id && i.status === "in_locker").length;
          return (
            <span
              key={locker.id}
              className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
            >
              {locker.name}: <span className="font-medium text-text">{count}</span>
            </span>
          );
        })}
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="No matching items"
            description="Try clearing the search or filters."
            action={
              <LinkButton href="/jewelry/edit/" variant="primary" size="sm">
                Add an item
              </LinkButton>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} href={`/jewelry/item/?id=${item.id}`} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
