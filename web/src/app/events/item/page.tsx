"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, MapPin, Pencil, Plus, Undo2 } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { addDays, formatDate, relativeDays, today } from "@/lib/format";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  Modal,
} from "@/components/ui";
import { ItemRow } from "@/components/vault";
import { EventModal } from "../page";

export default function EventDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <EventDetail />
    </Suspense>
  );
}

function EventDetail() {
  const id = useSearchParams().get("id") ?? undefined;
  const { state, eventById, itemById, saveEvent, returnItems } = useVault();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [returning, setReturning] = useState(false);

  const event = eventById(id);

  if (!event) {
    return (
      <EmptyState
        title="Event not found"
        action={
          <LinkButton href="/events/" variant="primary" size="sm">
            Back to events
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
        Events
      </Link>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{event.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(event.startsOn)}
              {event.endsOn !== event.startsOn ? ` – ${formatDate(event.endsOn)}` : ""}
            </span>
            {event.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {event.location}
              </span>
            ) : null}
            <span>{relativeDays(today(), event.startsOn)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit
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
              {withMembers.length} of {attached.length} items collected
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {stillInLocker.length > 0
                ? `${stillInLocker.length} still in a locker. Due back ${formatDate(addDays(event.endsOn, 1))} once taken.`
                : "Everything for this event is out of the locker."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {stillInLocker.length > 0 ? (
              <LinkButton
                href={`/movements/takeout/?event=${event.id}`}
                variant="primary"
                size="sm"
              >
                Take out {stillInLocker.length}
              </LinkButton>
            ) : null}
            {withMembers.length > 0 ? (
              <Button size="sm" onClick={() => setReturning(true)}>
                <Undo2 className="size-4" />
                Return all
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attached jewelry"
          description={`${attached.length} item${attached.length === 1 ? "" : "s"}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
              <Plus className="size-4" />
              Attach
            </Button>
          }
        />
        {attached.length === 0 ? (
          <EmptyState
            title="Nothing attached yet"
            description="Pick the pieces needed for this occasion."
            action={
              <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
                Attach jewelry
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
                    Remove
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
        title="Return all event items"
        footer={
          <Button variant="ghost" onClick={() => setReturning(false)}>
            Cancel
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Returning {withMembers.length} item(s). Which locker are they going into?
        </p>
        <div className="space-y-2">
          {state.lockers.map((l) => (
            <Button
              key={l.id}
              className="w-full justify-start"
              onClick={() => {
                returnItems(withMembers.map((i) => i!.id), l.id);
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
  const [selected, setSelected] = useState<string[]>(attachedIds);
  const candidates = activeItems(state);

  return (
    <Modal
      open
      onClose={onClose}
      title="Attach jewelry"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(selected)}>
            Save {selected.length} item{selected.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="-mx-2 max-h-96 divide-y divide-border overflow-y-auto">
        {candidates.map((item) => (
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
        ))}
      </div>
    </Modal>
  );
}
