"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Home, Plus, ShieldAlert } from "lucide-react";
import { activeItems, lockersNeedingVisit, useVault } from "@/lib/store";
import { daysBetween, estimateValue, formatMoneyShort, formatWeight, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Meter,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { useShowPrices } from "@/components/vault";
import { cn, newId } from "@/lib/utils";
import type { Locker } from "@/lib/types";

export default function LockersPage() {
  const { state, userById, recordLockerVisit, saveLocker } = useVault();
  const t = useT();
  const showPrices = useShowPrices();
  const [editing, setEditing] = useState<Locker | null>(null);

  const items = activeItems(state);
  const needVisit = new Set(lockersNeedingVisit(state).map((l) => l.id));
  const totalItems = items.filter((i) => i.status === "in_locker").length;

  function blankLocker(): Locker {
    return {
      id: newId(),
      familyId: state.settings.familyId,
      name: "",
      type: "bank",
      visitIntervalDays: 90,
      lastVisitedOn: today(),
    };
  }

  return (
    <>
      <PageHeader
        title={t("lockers.title")}
        subtitle={t("lockers.subtitle", { count: state.lockers.length, items: totalItems })}
        action={
          <Button variant="primary" onClick={() => setEditing(blankLocker())}>
            <Plus className="size-4" />
            {t("common.add")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {state.lockers.map((locker) => {
          const contents = items.filter(
            (i) => i.currentLockerId === locker.id && i.status === "in_locker",
          );
          const value = contents.reduce((s, i) => s + estimateValue(i, state.settings), 0);
          const weight = contents.reduce((s, i) => s + i.grossWeight, 0);
          const overdueVisit = needVisit.has(locker.id);
          const sinceVisit = locker.lastVisitedOn ? daysBetween(locker.lastVisitedOn, today()) : null;

          return (
            <Card key={locker.id} className={overdueVisit ? "border-warn/40" : undefined}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {locker.type === "bank" ? (
                      <Building2 className="size-4 shrink-0 text-muted" />
                    ) : (
                      <Home className="size-4 shrink-0 text-muted" />
                    )}
                    {locker.name}
                  </span>
                }
                description={
                  [locker.branch, locker.lockerNumber].filter(Boolean).join(" · ") || undefined
                }
                action={
                  <button
                    type="button"
                    onClick={() => setEditing(locker)}
                    className="text-sm text-gold hover:underline"
                  >
                    {t("common.edit")}
                  </button>
                }
              />

              <div className="space-y-3 p-4">
                <div
                  className={cn(
                    "grid gap-2 text-center",
                    showPrices ? "grid-cols-3" : "grid-cols-2",
                  )}
                >
                  <div>
                    <p className="tabular text-lg font-semibold">{contents.length}</p>
                    <p className="text-xs text-muted">{t("lockers.items")}</p>
                  </div>
                  <div>
                    <p className="tabular text-lg font-semibold">{formatWeight(weight)}</p>
                    <p className="text-xs text-muted">{t("lockers.gross")}</p>
                  </div>
                  {showPrices ? (
                    <div>
                      <p className="tabular text-lg font-semibold">{formatMoneyShort(value)}</p>
                      <p className="text-xs text-muted">{t("lockers.value")}</p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted">{t("lockers.shareOfVault")}</span>
                    <span className="tabular">
                      {totalItems > 0 ? Math.round((contents.length / totalItems) * 100) : 0}%
                    </span>
                  </div>
                  <Meter value={contents.length} max={Math.max(totalItems, 1)} />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {overdueVisit ? (
                        <ShieldAlert className="size-4 shrink-0 text-warn" />
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-ok" />
                      )}
                      {overdueVisit ? t("lockers.visitOverdue") : t("lockers.verified")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {sinceVisit == null
                        ? t("lockers.neverVisited")
                        : t("lockers.visitInterval", {
                            days: sinceVisit,
                            interval: locker.visitIntervalDays ?? "—",
                          })}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => recordLockerVisit(locker.id)}>
                    {t("lockers.verifyNow")}
                  </Button>
                </div>

                <p className="text-xs text-muted">
                  {t("lockers.keyHolder", {
                    name: userById(locker.keyHolderId)?.displayName ?? t("lockers.unassigned"),
                  })}
                </p>

                <Link
                  href={`/jewelry/?locker=${locker.id}`}
                  className="block text-sm text-gold hover:underline"
                >
                  {t("lockers.viewContents")}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {editing ? (
        <LockerModal
          locker={editing}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            saveLocker(l);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function LockerModal({
  locker,
  onClose,
  onSave,
}: {
  locker: Locker;
  onClose: () => void;
  onSave: (locker: Locker) => void;
}) {
  const { state } = useVault();
  const t = useT();
  const [form, setForm] = useState<Locker>(locker);

  function set<K extends keyof Locker>(key: K, value: Locker[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={locker.name ? t("lockers.editTitle") : t("lockers.addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("lockers.name")} required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("lockers.namePlaceholder")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("lockers.type")}>
            <Select
              value={form.type}
              onChange={(e) => set("type", e.target.value as Locker["type"])}
            >
              <option value="bank">{t("lockers.typeBank")}</option>
              <option value="home">{t("lockers.typeHome")}</option>
            </Select>
          </Field>
          <Field label={t("lockers.keyHolderLabel")}>
            <Select
              value={form.keyHolderId ?? ""}
              onChange={(e) => set("keyHolderId", e.target.value)}
            >
              <option value="">{t("lockers.unassigned")}</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("lockers.branch")}>
            <Input value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
          </Field>
          <Field label={t("lockers.number")}>
            <Input
              value={form.lockerNumber ?? ""}
              onChange={(e) => set("lockerNumber", e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("lockers.verifyEvery")} hint={t("lockers.verifyEveryHint")}>
          <Input
            type="number"
            min="0"
            value={form.visitIntervalDays ?? ""}
            onChange={(e) => set("visitIntervalDays", Number(e.target.value))}
          />
        </Field>
      </div>
    </Modal>
  );
}
