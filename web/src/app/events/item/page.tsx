"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronLeft, MapPin, Pencil, Plus, Undo2 } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { addDays, formatDate, today } from "@/lib/format";
import { useRelativeDays, useT } from "@/lib/i18n";
import { Button, Card, CardHeader, EmptyState, LinkButton, Modal } from "@/components/ui";
import { ItemRow } from "@/components/vault";
import { cn } from "@/lib/utils";
import { EventModal } from "../page";

export default function EventDetailPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
      <EventDetail />
    </Suspense>
  );
}

function EventDetail() {
  const id = useSearchParams().get("id") ?? undefined;
  const { state, eventById, itemById, saveEvent, returnItems } = useVault();
  const t = useT();
  const relative = useRelativeDays();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [returning, setReturning] = useState(false);

  const event = eventById(id);

  if (!event) {
    return (
      <EmptyState
        title={t("event.notFound")}
        action={
          <LinkButton href="/events/" variant="primary" size="sm">
            {t("event.backToEvents")}
          </LinkButton>
        }
      />
    );
  }

  const attached = event.jewelryIds.map((jid) => itemById(jid)).filter(Boolean);
  const stillInLocker = attached.filter((i) => i!.status === "in_locker");
  const withMembers = attached.filter((i) => i!.status === "with_member");

  function detach(jewelryId: string) {
    saveEvent({ ...event!, jewelryIds: event!.jewelryIds.filter((x) => x !== jewelryId) });
  }

  return (
    <>
      <Link
        href="/events/"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
        {t("events.title")}
      </Link>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{event.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5 shrink-0" />
              {formatDate(event.startsOn)}
              {event.endsOn !== event.startsOn ? ` – ${formatDate(event.endsOn)}` : ""}
            </span>
            {event.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" />
                {event.location}
              </span>
            ) : null}
            <span>{relative(today(), event.startsOn)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          {t("common.edit")}
        </Button>
      </div>

      {event.notes ? (
        <Card className="mb-4">
          <p className="p-4 text-sm">{event.notes}</p>
        </Card>
      ) : null}

      {/*
        The event → movement chain. Taking out for an event pre-fills the reason
        and sets every due date to the day after the event ends.
      */}
      <Card className="mb-4 bg-surface-2">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              {t("event.collected", { collected: withMembers.length, total: attached.length })}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {stillInLocker.length > 0
                ? t("event.stillInLocker", {
                    n: stillInLocker.length,
                    date: formatDate(addDays(event.endsOn, 1)),
                  })
                : t("event.allOut")}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {stillInLocker.length > 0 ? (
              <LinkButton href={`/movements/takeout/?event=${event.id}`} variant="primary" size="sm">
                {t("event.takeOutN", { n: stillInLocker.length })}
              </LinkButton>
            ) : null}
            {withMembers.length > 0 ? (
              <Button size="sm" onClick={() => setReturning(true)}>
                <Undo2 className="size-4" />
                {t("event.returnAll")}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("event.attached")}
          description={t("event.attachedCount", { n: attached.length })}
          action={
            <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
              <Plus className="size-4" />
              {t("event.attach")}
            </Button>
          }
        />
        {attached.length === 0 ? (
          <EmptyState
            title={t("event.nothingAttached")}
            description={t("event.nothingAttachedDesc")}
            action={
              <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
                {t("event.attachJewelry")}
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {attached.map((item) => (
              <ItemRow
                key={item!.id}
                item={item!}
                href={`/jewelry/item/?id=${item!.id}`}
                right={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      detach(item!.id);
                    }}
                    className="shrink-0 text-sm text-muted hover:text-danger"
                  >
                    {t("common.remove")}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </Card>

      {editing ? (
        <EventModal
          event={event}
          onClose={() => setEditing(false)}
          onSave={(e) => {
            saveEvent(e);
            setEditing(false);
          }}
        />
      ) : null}

      {picking ? (
        <AttachModal
          attachedIds={event.jewelryIds}
          onClose={() => setPicking(false)}
          onSave={(ids) => {
            saveEvent({ ...event, jewelryIds: ids });
            setPicking(false);
          }}
        />
      ) : null}

      <Modal
        open={returning}
        onClose={() => setReturning(false)}
        title={t("event.returnAllTitle")}
        footer={
          <Button variant="ghost" onClick={() => setReturning(false)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {t("event.returnAllBody", { n: withMembers.length })}
        </p>
        <div className="space-y-2">
          {state.lockers.map((l) => (
            <Button
              key={l.id}
              className="w-full justify-start"
              onClick={() => {
                returnItems(
                  withMembers.map((i) => i!.id),
                  l.id,
                );
                setReturning(false);
              }}
            >
              {l.name}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}

function AttachModal({
  attachedIds,
  onClose,
  onSave,
}: {
  attachedIds: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const { state } = useVault();
  const t = useT();
  const [selected, setSelected] = useState<string[]>(attachedIds);
  /** Empty means "no filter" rather than "show nothing" — the useful default. */
  const [owners, setOwners] = useState<string[]>([]);

  const candidates = activeItems(state);
  // Only offer owners who actually own something; a family member with no
  // jewelry is noise in this filter.
  const ownerOptions = state.users.filter((u) => candidates.some((i) => i.ownerId === u.id));
  const visible =
    owners.length === 0 ? candidates : candidates.filter((i) => owners.includes(i.ownerId));

  function toggleOwner(id: string) {
    setOwners((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("event.attachJewelry")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onSave(selected)}>
            {t("event.saveN", { n: selected.length })}
          </Button>
        </>
      }
    >
      <div className="mb-3">
        <p className="mb-2 text-xs font-medium text-muted">{t("event.filterByOwner")}</p>
        <div className="flex flex-wrap gap-1.5">
          <OwnerChip
            label={t("event.ownerAll")}
            checked={owners.length === 0}
            onClick={() => setOwners([])}
          />
          {ownerOptions.map((u) => (
            <OwnerChip
              key={u.id}
              label={u.displayName}
              count={candidates.filter((i) => i.ownerId === u.id).length}
              checked={owners.includes(u.id)}
              onClick={() => toggleOwner(u.id)}
            />
          ))}
        </div>
      </div>

      <div className="-mx-2 max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t("event.noneMatchOwner")}</p>
        ) : (
          visible.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selectable
              selected={selected.includes(item.id)}
              onToggle={() =>
                setSelected((prev) =>
                  prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                )
              }
            />
          ))
        )}
      </div>
    </Modal>
  );
}

/** Checkbox-style owner filter pill. */
function OwnerChip({
  label,
  count,
  checked,
  onClick,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={checked}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        checked
          ? "border-gold bg-gold-soft text-gold-deep"
          : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
          checked ? "border-gold bg-gold text-white" : "border-border",
        )}
      >
        {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      {label}
      {count != null ? <span className="text-muted">{count}</span> : null}
    </button>
  );
}
