"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Home, Plus, ShieldAlert } from "lucide-react";
import { activeItems, lockersNeedingVisit, useVault } from "@/lib/store";
import { daysBetween, estimateValue, formatMoneyShort, formatWeight, today } from "@/lib/format";
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
import { newId } from "@/lib/utils";
import type { Locker } from "@/lib/types";

export default function LockersPage() {
  const { state, userById, recordLockerVisit, saveLocker } = useVault();
  const [editing, setEditing] = useState<Locker | null>(null);

  const items = activeItems(state);
  const needVisit = new Set(lockersNeedingVisit(state).map((l) => l.id));
  const totalItems = items.filter((i) => i.status === "in_locker").length;

  function blankLocker(): Locker {
    return {
      id: newId("l"),
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
        title="Lockers"
        subtitle={`${state.lockers.length} locations · ${totalItems} items secured`}
        action={
          <Button variant="primary" onClick={() => setEditing(blankLocker())}>
            <Plus className="size-4" />
            Add
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
                      <Building2 className="size-4 text-muted" />
                    ) : (
                      <Home className="size-4 text-muted" />
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
                    Edit
                  </button>
                }
              />

              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="tabular text-lg font-semibold">{contents.length}</p>
                    <p className="text-xs text-muted">items</p>
                  </div>
                  <div>
                    <p className="tabular text-lg font-semibold">{formatWeight(weight)}</p>
                    <p className="text-xs text-muted">gross</p>
                  </div>
                  <div>
                    <p className="tabular text-lg font-semibold">{formatMoneyShort(value)}</p>
                    <p className="text-xs text-muted">value</p>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted">Share of vault</span>
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
                        <ShieldAlert className="size-4 text-warn" />
                      ) : (
                        <CheckCircle2 className="size-4 text-ok" />
                      )}
                      {overdueVisit ? "Visit overdue" : "Verified"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {sinceVisit == null
                        ? "Never visited"
                        : `${sinceVisit} days ago · every ${locker.visitIntervalDays ?? "—"} days`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => recordLockerVisit(locker.id)}>
                    Verify now
                  </Button>
                </div>

                <p className="text-xs text-muted">
                  Key holder: {userById(locker.keyHolderId)?.displayName ?? "unassigned"}
                </p>

                <Link
                  href={`/jewelry/?locker=${locker.id}`}
                  className="block text-sm text-gold hover:underline"
                >
                  View contents
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
  const [form, setForm] = useState<Locker>(locker);

  function set<K extends keyof Locker>(key: K, value: Locker[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={locker.name ? "Edit locker" : "Add locker"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="SBI Locker"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => set("type", e.target.value as Locker["type"])}
            >
              <option value="bank">Bank locker</option>
              <option value="home">Home safe</option>
            </Select>
          </Field>
          <Field label="Key holder">
            <Select
              value={form.keyHolderId ?? ""}
              onChange={(e) => set("keyHolderId", e.target.value)}
            >
              <option value="">Unassigned</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Branch">
            <Input value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
          </Field>
          <Field label="Locker number">
            <Input
              value={form.lockerNumber ?? ""}
              onChange={(e) => set("lockerNumber", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Verify every (days)" hint="Drives the locker visit reminder">
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
