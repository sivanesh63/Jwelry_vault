"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { useVault } from "@/lib/store";
import { addDays, daysBetween, formatDate, relativeDays, today } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Meter,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { newId } from "@/lib/utils";
import type { FamilyEvent } from "@/lib/types";

export default function EventsPage() {
  const { state, saveEvent } = useVault();
  // Holds the draft event; built in the click handler so no id is generated
  // during render.
  const [creating, setCreating] = useState<FamilyEvent | null>(null);

  const sorted = state.events.slice().sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const upcoming = sorted.filter((e) => daysBetween(today(), e.endsOn) >= 0);
  const past = sorted.filter((e) => daysBetween(today(), e.endsOn) < 0).reverse();

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Attach jewelry to an occasion, then take it all out in one step."
        action={
          <Button
            variant="primary"
            onClick={() =>
              setCreating({
                id: newId("e"),
                familyId: state.settings.familyId,
                name: "",
                startsOn: addDays(today(), 7),
                endsOn: addDays(today(), 7),
                jewelryIds: [],
              })
            }
          >
            <Plus className="size-4" />
            Add
          </Button>
        }
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="No upcoming events"
          description="Create one to plan which jewelry is needed and when it comes back."
          icon={<CalendarDays className="size-8" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {past.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Past events</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((event) => (
              <EventCard key={event.id} event={event} past />
            ))}
          </div>
        </>
      ) : null}

      {creating ? (
        <EventModal
          event={creating}
          onClose={() => setCreating(null)}
          onSave={(e) => {
            saveEvent(e);
            setCreating(null);
          }}
        />
      ) : null}
    </>
  );
}

function EventCard({ event, past }: { event: FamilyEvent; past?: boolean }) {
  const { state } = useVault();
  const ready = event.jewelryIds.filter(
    (id) => state.jewelry.find((j) => j.id === id)?.status === "with_member",
  ).length;
  const daysAway = daysBetween(today(), event.startsOn);

  return (
    <Link
      href={`/events/item/?id=${event.id}`}
      className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{event.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDate(event.startsOn)}
            {event.endsOn !== event.startsOn ? ` – ${formatDate(event.endsOn)}` : ""}
          </p>
        </div>
        {!past ? (
          <Badge
            tone={
              daysAway <= 3
                ? "bg-warn/10 text-warn border-warn/30"
                : "border-border bg-surface-2 text-muted"
            }
          >
            {relativeDays(today(), event.startsOn)}
          </Badge>
        ) : null}
      </div>

      {event.location ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          <MapPin className="size-3" />
          {event.location}
        </p>
      ) : null}

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">Items ready</span>
          <span className="tabular">
            {ready}/{event.jewelryIds.length}
          </span>
        </div>
        <Meter
          value={ready}
          max={Math.max(event.jewelryIds.length, 1)}
          tone={ready === event.jewelryIds.length ? "bg-ok" : "bg-gold"}
        />
      </div>
    </Link>
  );
}

export function EventModal({
  event,
  onClose,
  onSave,
}: {
  event: FamilyEvent;
  onClose: () => void;
  onSave: (event: FamilyEvent) => void;
}) {
  const [form, setForm] = useState<FamilyEvent>(event);

  function set<K extends keyof FamilyEvent>(key: K, value: FamilyEvent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event.name ? "Edit event" : "New event"}
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
            placeholder="Ramya's wedding"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <Input
              type="date"
              value={form.startsOn}
              onChange={(e) => {
                const startsOn = e.target.value;
                // Keep the range valid without nagging the user about it.
                setForm((f) => ({
                  ...f,
                  startsOn,
                  endsOn: f.endsOn < startsOn ? startsOn : f.endsOn,
                }));
              }}
            />
          </Field>
          <Field label="Ends">
            <Input
              type="date"
              value={form.endsOn}
              min={form.startsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Location">
          <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
