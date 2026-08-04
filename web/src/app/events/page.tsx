"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { useVault } from "@/lib/store";
import { addDays, daysBetween, formatDate, today } from "@/lib/format";
import { useRelativeDays, useT } from "@/lib/i18n";
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
  const t = useT();
  // Holds the draft event; built in the click handler so no id is generated
  // during render.
  const [creating, setCreating] = useState<FamilyEvent | null>(null);

  const sorted = state.events.slice().sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const upcoming = sorted.filter((e) => daysBetween(today(), e.endsOn) >= 0);
  const past = sorted.filter((e) => daysBetween(today(), e.endsOn) < 0).reverse();

  return (
    <>
      <PageHeader
        title={t("events.title")}
        subtitle={t("events.subtitle")}
        action={
          <Button
            variant="primary"
            onClick={() =>
              setCreating({
                id: newId(),
                familyId: state.settings.familyId,
                name: "",
                startsOn: addDays(today(), 7),
                endsOn: addDays(today(), 7),
                jewelryIds: [],
              })
            }
          >
            <Plus className="size-4" />
            {t("common.add")}
          </Button>
        }
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title={t("events.noUpcoming")}
          description={t("events.noUpcomingDesc")}
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
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">{t("events.past")}</h2>
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
  const t = useT();
  const relative = useRelativeDays();
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
            {relative(today(), event.startsOn)}
          </Badge>
        ) : null}
      </div>

      {event.location ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          <MapPin className="size-3 shrink-0" />
          {event.location}
        </p>
      ) : null}

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{t("events.itemsReady")}</span>
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
  const t = useT();
  const [form, setForm] = useState<FamilyEvent>(event);

  function set<K extends keyof FamilyEvent>(key: K, value: FamilyEvent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event.name ? t("events.editTitle") : t("events.newTitle")}
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
        <Field label={t("events.name")} required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("events.namePlaceholder")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("events.starts")}>
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
          <Field label={t("events.ends")}>
            <Input
              type="date"
              value={form.endsOn}
              min={form.startsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("events.location")}>
          <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label={t("events.notes")}>
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
