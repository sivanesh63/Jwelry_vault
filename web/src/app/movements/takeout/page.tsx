"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { activeItems, suggestedReturnDate, useVault } from "@/lib/store";
import { formatDate, today } from "@/lib/format";
import { Button, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui";
import { ItemRow } from "@/components/vault";

export default function TakeOutPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <TakeOut />
    </Suspense>
  );
}

function TakeOut() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, currentUser, takeOut, eventById } = useVault();

  const preselectItem = params.get("id");
  const preselectEvent = params.get("event") ?? "";

  const available = activeItems(state).filter((j) => j.status === "in_locker");

  const [selected, setSelected] = useState<string[]>(
    preselectItem && available.some((a) => a.id === preselectItem) ? [preselectItem] : [],
  );
  const [holderId, setHolderId] = useState(currentUser.id);
  const [eventId, setEventId] = useState(preselectEvent);
  const [reason, setReason] = useState(
    preselectEvent ? (eventById(preselectEvent)?.name ?? "") : "",
  );
  const [returnOn, setReturnOn] = useState(
    suggestedReturnDate(eventById(preselectEvent)?.endsOn),
  );

  /**
   * Choosing an event auto-fills the reason and sets the due date to the day
   * after it ends. This is the event→movement chain the original plan left
   * unconnected, and it is the single highest-value automation in the app.
   */
  function onEventChange(id: string) {
    setEventId(id);
    const event = eventById(id);
    if (event) {
      setReason(event.name);
      setReturnOn(suggestedReturnDate(event.endsOn));
      // Pull in items already earmarked for the event that are still in a locker.
      const earmarked = event.jewelryIds.filter((jid) => available.some((a) => a.id === jid));
      setSelected((prev) => Array.from(new Set([...prev, ...earmarked])));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const valid = selected.length > 0 && returnOn >= today();

  function submit() {
    takeOut({
      jewelryIds: selected,
      holderId,
      reason: reason.trim(),
      expectedReturnOn: returnOn,
      eventId: eventId || undefined,
    });
    router.push("/movements/");
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
      <h1 className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">Take out</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Select items"
            description={`${selected.length} of ${available.length} selected`}
            action={
              selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-sm text-gold hover:underline"
                >
                  Clear
                </button>
              ) : null
            }
          />
          {available.length === 0 ? (
            <EmptyState
              title="Nothing available"
              description="Only items currently in a locker can be taken out."
            />
          ) : (
            <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {available.map((item) => (
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
            <CardHeader title="Details" />
            <div className="space-y-3 p-4">
              <Field label="Who is taking it" required>
                <Select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
                  {state.users
                    .filter((u) => u.isActive)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                        {u.id === currentUser.id ? " (you)" : ""}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="For an event?" hint="Sets the due date to the day after it ends">
                <Select value={eventId} onChange={(e) => onEventChange(e.target.value)}>
                  <option value="">Not for an event</option>
                  {state.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} — {formatDate(ev.startsOn)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Reason">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Wedding, daily wear, photoshoot…"
                />
              </Field>

              <Field label="Expected return" required>
                <Input
                  type="date"
                  value={returnOn}
                  min={today()}
                  onChange={(e) => setReturnOn(e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card className="bg-surface-2">
            <div className="flex items-start gap-3 p-4">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-muted" />
              <p className="text-sm text-muted">
                A reminder fires the morning {selected.length === 1 ? "this item" : "these items"}{" "}
                {returnOn ? `is due back (${formatDate(returnOn)})` : "become due"}, and again each
                day it stays overdue.
              </p>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid} onClick={submit}>
              Take out {selected.length > 0 ? `${selected.length} item${selected.length > 1 ? "s" : ""}` : ""}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
