"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, PackageCheck, Truck } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { Button, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui";
import { ItemRow } from "@/components/vault";

export default function TransferPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Transfer />
    </Suspense>
  );
}

function Transfer() {
  const router = useRouter();
  const preselect = useSearchParams().get("id");
  const { state, lockerById, startTransfer, confirmArrival } = useVault();

  const inLocker = activeItems(state).filter((j) => j.status === "in_locker");
  const inTransit = activeItems(state).filter((j) => j.status === "in_transit");

  const [selected, setSelected] = useState<string[]>(
    preselect && inLocker.some((i) => i.id === preselect) ? [preselect] : [],
  );
  const [fromLocker, setFromLocker] = useState<string>("all");
  const [toLocker, setToLocker] = useState(state.lockers[1]?.id ?? state.lockers[0]?.id ?? "");
  const [reason, setReason] = useState("");

  const visible = fromLocker === "all" ? inLocker : inLocker.filter((i) => i.currentLockerId === fromLocker);
  // An item cannot be transferred to the locker it already sits in.
  const selectable = visible.filter((i) => i.currentLockerId !== toLocker);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    startTransfer(selected, toLocker, reason.trim());
    setSelected([]);
    setReason("");
  }

  return (
    <>
      <Link
        href="/movements/"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
        Movements
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight sm:text-2xl">
        Transfer between lockers
      </h1>
      <p className="mb-5 text-sm text-muted">
        Items move through an <strong className="text-text">in transit</strong> state so they are
        never invisible mid-move. Confirm arrival once they are physically placed.
      </p>

      {inTransit.length > 0 ? (
        <Card className="mb-4 border-info/30 bg-info/5">
          <CardHeader
            title={`${inTransit.length} item${inTransit.length > 1 ? "s" : ""} in transit`}
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={() => confirmArrival(inTransit.map((i) => i.id))}
              >
                <PackageCheck className="size-4" />
                Confirm all
              </Button>
            }
          />
          <div className="divide-y divide-border">
            {inTransit.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                right={
                  <div className="shrink-0">
                    <Button size="sm" onClick={() => confirmArrival([item.id])}>
                      Arrived at {lockerById(item.currentLockerId)?.name ?? "locker"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Select items"
            description={`${selected.length} selected`}
          />
          <div className="border-b border-border p-3">
            <Select value={fromLocker} onChange={(e) => setFromLocker(e.target.value)}>
              <option value="all">From any locker</option>
              {state.lockers.map((l) => (
                <option key={l.id} value={l.id}>
                  From {l.name}
                </option>
              ))}
            </Select>
          </div>
          {selectable.length === 0 ? (
            <EmptyState
              title="No items available"
              description="Pick a different source locker, or a different destination."
            />
          ) : (
            <div className="max-h-[26rem] divide-y divide-border overflow-y-auto">
              {selectable.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selectable
                  selected={selected.includes(item.id)}
                  onToggle={() => toggle(item.id)}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Destination" />
            <div className="space-y-3 p-4">
              <Field label="Move to" required>
                <Select value={toLocker} onChange={(e) => setToLocker(e.target.value)}>
                  {state.lockers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.branch ? ` — ${l.branch}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reason">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Consolidating the bridal set…"
                />
              </Field>
            </div>
          </Card>

          {selected.length > 0 ? (
            <Card className="bg-surface-2">
              <div className="flex items-center gap-3 p-4 text-sm">
                <Truck className="size-5 shrink-0 text-muted" />
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{selected.length} item(s)</span>
                  <ArrowRight className="size-3.5 text-muted" />
                  <span className="font-medium">{lockerById(toLocker)?.name}</span>
                </span>
              </div>
            </Card>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button variant="primary" disabled={selected.length === 0 || !toLocker} onClick={submit}>
              Start transfer
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
