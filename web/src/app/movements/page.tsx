"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, PackageCheck, Undo2, Upload } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ItemRow } from "@/components/vault";
import { cn } from "@/lib/utils";

type Tab = "out" | "history";

export default function MovementsPage() {
  const { state, userById, itemById } = useVault();
  const [tab, setTab] = useState<Tab>("out");

  const items = activeItems(state);
  const away = items.filter(
    (j) => j.status === "with_member" || j.status === "at_jeweler" || j.status === "in_transit",
  );
  const history = state.movements
    .slice()
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));

  return (
    <>
      <PageHeader
        title="Movements"
        subtitle="Every movement is permanent — rows are closed, never edited or deleted."
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <LinkButton href="/movements/takeout/" variant="primary" className="flex-col !h-auto py-3">
          <Upload className="size-4" />
          <span className="text-xs">Take out</span>
        </LinkButton>
        <LinkButton href="/movements/return/" className="flex-col !h-auto py-3">
          <Undo2 className="size-4" />
          <span className="text-xs">Return</span>
        </LinkButton>
        <LinkButton href="/movements/transfer/" className="flex-col !h-auto py-3">
          <ArrowLeftRight className="size-4" />
          <span className="text-xs">Transfer</span>
        </LinkButton>
      </div>

      <div className="mb-3 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(
          [
            ["out", `Currently out (${away.length})`],
            ["history", `History (${history.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-gold-soft text-gold-deep" : "text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "out" ? (
        <Card>
          {away.length === 0 ? (
            <EmptyState
              title="Nothing is out"
              description="Every item is accounted for in a locker."
            />
          ) : (
            <div className="divide-y divide-border">
              {away.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  href={`/jewelry/item/?id=${item.id}`}
                  right={
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted">
                        {item.expectedReturnOn ? `Due ${formatDate(item.expectedReturnOn)}` : "No due date"}
                      </p>
                      {item.status === "in_transit" ? (
                        <Badge tone="bg-info/10 text-info border-info/25">
                          <PackageCheck className="size-3" />
                          Confirm arrival
                        </Badge>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="All movements" />
          <ol className="divide-y divide-border">
            {history.map((m) => {
              const item = itemById(m.jewelryId);
              return (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/jewelry/item/?id=${m.jewelryId}`}
                      className="truncate font-medium hover:underline"
                    >
                      {item?.name ?? "Archived item"}
                    </Link>
                    <Badge>{m.returnedAt ? "Closed" : "Open"}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm capitalize text-muted">
                    {m.type} · {m.fromLocation} → {m.toLocation}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDateTime(m.takenAt)} by {userById(m.actorId)?.displayName ?? "—"}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </>
  );
}
