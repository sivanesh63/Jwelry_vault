"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Info } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { daysBetween, formatDate, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Button, Card, CardHeader, EmptyState, Field, Select } from "@/components/ui";
import { ItemRow } from "@/components/vault";
import { cn } from "@/lib/utils";

export default function ReturnPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
      <ReturnItems />
    </Suspense>
  );
}

function ReturnItems() {
  const router = useRouter();
  const preselect = useSearchParams().get("id");
  const { state, userById, returnItems } = useVault();
  const t = useT();

  const out = activeItems(state).filter((j) => j.status === "with_member");
  const [selected, setSelected] = useState<string[]>(
    preselect && out.some((o) => o.id === preselect) ? [preselect] : [],
  );
  const [lockerId, setLockerId] = useState(state.lockers[0]?.id ?? "");
  const [holderFilter, setHolderFilter] = useState<string>("all");

  const visible =
    holderFilter === "all" ? out : out.filter((i) => i.currentHolderId === holderFilter);
  const holders = Array.from(new Set(out.map((i) => i.currentHolderId).filter(Boolean) as string[]));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    returnItems(selected, lockerId);
    router.push("/movements/");
  }

  return (
    <>
      <Link
        href="/movements/"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
        {t("movements.title")}
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight sm:text-2xl">{t("return.title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("return.subtitle")}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("return.currentlyOut")}
            description={t("takeout.selectedOf", {
              selected: selected.length,
              total: visible.length,
            })}
            action={
              <button
                type="button"
                onClick={() => setSelected(visible.map((i) => i.id))}
                className="text-sm text-gold hover:underline"
              >
                {t("common.selectAll")}
              </button>
            }
          />

          {holders.length > 1 ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 py-2.5">
              <FilterChip active={holderFilter === "all"} onClick={() => setHolderFilter("all")}>
                {t("common.everyone")}
              </FilterChip>
              {holders.map((h) => (
                <FilterChip key={h} active={holderFilter === h} onClick={() => setHolderFilter(h)}>
                  {userById(h)?.displayName ?? t("common.unknown")}
                </FilterChip>
              ))}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              title={t("return.nothingToReturn")}
              description={t("return.nothingToReturnDesc")}
            />
          ) : (
            <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {visible.map((item) => {
                const overdueBy = item.expectedReturnOn
                  ? daysBetween(item.expectedReturnOn, today())
                  : 0;
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    selectable
                    selected={selected.includes(item.id)}
                    onToggle={() => toggle(item.id)}
                    right={
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className={cn("text-xs", overdueBy > 0 ? "text-danger" : "text-muted")}>
                          {item.expectedReturnOn
                            ? t("movements.due", { date: formatDate(item.expectedReturnOn) })
                            : "—"}
                        </p>
                        <p className="text-xs text-muted">
                          {userById(item.currentHolderId)?.displayName}
                        </p>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("return.destination")} />
            <div className="p-4">
              <Field label={t("return.locker")} required>
                <Select value={lockerId} onChange={(e) => setLockerId(e.target.value)}>
                  {state.lockers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.branch ? ` — ${l.branch}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="bg-surface-2">
            <div className="flex items-start gap-3 p-4">
              <Info className="mt-0.5 size-5 shrink-0 text-muted" />
              <p className="text-sm text-muted">{t("return.visitNote")}</p>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" disabled={selected.length === 0 || !lockerId} onClick={submit}>
              {t("return.action", { n: selected.length })}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-gold bg-gold-soft text-gold-deep"
          : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
