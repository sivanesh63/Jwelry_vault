"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Archive,
  ChevronLeft,
  FileText,
  Hammer,
  PackageCheck,
  Pencil,
  QrCode,
  Undo2,
  Upload,
} from "lucide-react";
import { useVault } from "@/lib/store";
import {
  STATUS_LABEL,
  addDays,
  estimateValue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatWeight,
  today,
} from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Modal,
} from "@/components/ui";
import { CATEGORY_LABEL, DetailRow, DueBadge, PhotoTile, StatusBadge } from "@/components/vault";

export default function JewelryDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <JewelryDetail />
    </Suspense>
  );
}

function JewelryDetail() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? undefined;
  const {
    state,
    itemById,
    userById,
    lockerById,
    locationOf,
    movementsOf,
    documentsOf,
    openMovementOf,
    collectFromJeweler,
    confirmArrival,
    sendToJeweler,
    archiveItem,
    extendReturn,
  } = useVault();

  const [serviceOpen, setServiceOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const item = itemById(id);

  if (!item) {
    return (
      <EmptyState
        title="Item not found"
        description="It may have been archived, or the link is out of date."
        action={
          <LinkButton href="/jewelry/" variant="primary" size="sm">
            Back to jewelry
          </LinkButton>
        }
      />
    );
  }

  const owner = userById(item.ownerId);
  const holder = userById(item.currentHolderId);
  const movements = movementsOf(item.id);
  const documents = documentsOf(item.id);
  const openMovement = openMovementOf(item.id);
  const value = estimateValue(item, state.settings);

  return (
    <>
      <Link
        href="/jewelry/"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
        Jewelry
      </Link>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <PhotoTile item={item} className="h-40 w-full sm:size-40" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{item.name}</h1>
            <StatusBadge item={item} />
            <DueBadge item={item} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {CATEGORY_LABEL[item.category]} · {item.purity}K · {formatWeight(item.grossWeight)}
          </p>
          <p className="mt-3 text-2xl font-semibold tabular">{formatMoney(value)}</p>
          <p className="text-xs text-muted">
            estimated from {formatWeight(item.netGoldWeight)} net gold at current rate
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {item.status === "in_locker" ? (
              <>
                <LinkButton href={`/movements/takeout/?id=${item.id}`} variant="primary" size="sm">
                  Take out
                </LinkButton>
                <LinkButton href={`/movements/transfer/?id=${item.id}`} size="sm">
                  <ArrowLeftRight className="size-4" />
                  Transfer
                </LinkButton>
                <Button size="sm" onClick={() => setServiceOpen(true)}>
                  <Hammer className="size-4" />
                  Send for service
                </Button>
              </>
            ) : null}

            {item.status === "with_member" ? (
              <>
                <LinkButton href={`/movements/return/?id=${item.id}`} variant="primary" size="sm">
                  <Undo2 className="size-4" />
                  Return
                </LinkButton>
                <Button size="sm" onClick={() => setExtendOpen(true)}>
                  Extend due date
                </Button>
              </>
            ) : null}

            {item.status === "in_transit" ? (
              <Button size="sm" variant="primary" onClick={() => confirmArrival([item.id])}>
                <PackageCheck className="size-4" />
                Confirm arrival at {lockerById(item.currentLockerId)?.name ?? "locker"}
              </Button>
            ) : null}

            {item.status === "at_jeweler" ? (
              <Button size="sm" variant="primary" onClick={() => setCollectOpen(true)}>
                <PackageCheck className="size-4" />
                Collect from jeweler
              </Button>
            ) : null}

            <LinkButton href={`/jewelry/edit/?id=${item.id}`} size="sm">
              <Pencil className="size-4" />
              Edit
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Current position" />
            <div className="px-4 py-1">
              <DetailRow label="Status" value={STATUS_LABEL[item.status]} />
              <DetailRow label="Location" value={locationOf(item)} />
              <DetailRow label="Owner" value={owner?.displayName ?? "—"} />
              {holder ? <DetailRow label="Held by" value={holder.displayName} /> : null}
              {item.expectedReturnOn ? (
                <DetailRow label="Expected back" value={formatDate(item.expectedReturnOn)} />
              ) : null}
              {openMovement?.reason ? (
                <DetailRow label="Reason" value={openMovement.reason} />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Specification" />
            <div className="px-4 py-1">
              <DetailRow label="Gross weight" value={formatWeight(item.grossWeight)} />
              <DetailRow label="Net gold weight" value={formatWeight(item.netGoldWeight)} />
              <DetailRow label="Stone weight" value={formatWeight(item.stoneWeight)} />
              <DetailRow label="Purity" value={`${item.purity}K`} />
              <DetailRow label="Hallmark" value={item.hallmarkNo ?? "—"} />
              <DetailRow label="Jeweler" value={item.jeweler ?? "—"} />
              <DetailRow label="Purchased" value={formatDate(item.purchaseDate)} />
              <DetailRow label="Purchase price" value={formatMoney(item.purchasePrice)} />
            </div>
          </Card>

          {item.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-4 py-3 text-sm">{item.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Documents"
              description={`${documents.length} on file`}
              action={
                <Button size="sm" variant="ghost">
                  <Upload className="size-4" />
                  Upload
                </Button>
              }
            />
            {documents.length === 0 ? (
              <EmptyState
                title="No documents yet"
                description="Invoice, hallmark certificate, insurance and warranty go here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.fileName}</span>
                      <span className="block text-xs capitalize text-muted">
                        {doc.type} · {formatDate(doc.uploadedAt)}
                        {doc.expiresOn ? ` · expires ${formatDate(doc.expiresOn)}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="History" description="Movements are permanent and never edited" />
            {movements.length === 0 ? (
              <EmptyState title="No movements recorded" />
            ) : (
              <ol className="divide-y divide-border">
                {movements.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium capitalize">{m.type}</p>
                      <Badge>{m.returnedAt ? "Closed" : "Open"}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {m.fromLocation} → {m.toLocation}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(m.takenAt)} by {userById(m.actorId)?.displayName ?? "—"}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </p>
                    {m.returnedAt ? (
                      <p className="text-xs text-muted">Closed {formatDateTime(m.returnedAt)}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Label" description="Stable ID — printed labels never need reprinting" />
            <div className="flex items-center gap-4 p-4">
              <QrPlaceholder value={item.id} />
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{item.id}</p>
                <LinkButton href={`/scan/?id=${item.id}`} size="sm" className="mt-2">
                  <QrCode className="size-4" />
                  Open scanner
                </LinkButton>
              </div>
            </div>
          </Card>

          <Button variant="danger" className="w-full" onClick={() => setArchiveOpen(true)}>
            <Archive className="size-4" />
            Archive item
          </Button>
        </div>
      </div>

      <ServiceModal
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
        defaultJeweler={item.jeweler ?? ""}
        onSubmit={(jeweler, reason, back) => {
          sendToJeweler(item.id, jeweler, reason, back);
          setServiceOpen(false);
        }}
      />

      <Modal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Collect from jeweler"
        footer={
          <Button variant="ghost" onClick={() => setCollectOpen(false)}>
            Cancel
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">Which locker is it going back into?</p>
        <div className="space-y-2">
          {state.lockers.map((l) => (
            <Button
              key={l.id}
              className="w-full justify-start"
              onClick={() => {
                collectFromJeweler(item.id, l.id);
                setCollectOpen(false);
              }}
            >
              {l.name}
            </Button>
          ))}
        </div>
      </Modal>

      <ExtendModal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        current={item.expectedReturnOn ?? today()}
        onSubmit={(date) => {
          extendReturn(item.id, date);
          setExtendOpen(false);
        }}
      />

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive this item?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                archiveItem(item.id);
                setArchiveOpen(false);
                router.push("/jewelry/");
              }}
            >
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Archiving hides <strong className="text-text">{item.name}</strong> from the inventory but
          keeps its full movement history. Nothing is deleted.
        </p>
      </Modal>
    </>
  );
}

function ServiceModal({
  open,
  onClose,
  defaultJeweler,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultJeweler: string;
  onSubmit: (jeweler: string, reason: string, expectedBack: string) => void;
}) {
  const [jeweler, setJeweler] = useState(defaultJeweler);
  const [reason, setReason] = useState("");
  const [back, setBack] = useState(addDays(today(), 7));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send for service"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!jeweler.trim()}
            onClick={() => onSubmit(jeweler.trim(), reason.trim(), back)}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Jeweler" required>
          <Input value={jeweler} onChange={(e) => setJeweler(e.target.value)} placeholder="Shop name" />
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Resize, polish, clasp repair…"
          />
        </Field>
        <Field label="Expected back">
          <Input type="date" value={back} onChange={(e) => setBack(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExtendModal({
  open,
  onClose,
  current,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
  onSubmit: (date: string) => void;
}) {
  const [date, setDate] = useState(addDays(current, 7));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Extend due date"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSubmit(date)}>
            Extend
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Currently due {formatDate(current)}. The change is recorded in the audit log, so the original
        promise stays visible.
      </p>
      <Field label="New return date">
        <Input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </Modal>
  );
}

/**
 * Deterministic QR-like block from the item id.
 * A placeholder for the real `qrcode` render in Phase 3 — the point here is that
 * the id is stable and printable, which is the decision that has to be right now.
 */
function QrPlaceholder({ value }: { value: string }) {
  const cells: boolean[] = [];
  let h = 7;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 49; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push(((h >> 16) & 1) === 1);
  }
  return (
    <div
      className="grid size-20 shrink-0 grid-cols-7 gap-px rounded border border-border bg-surface p-1"
      aria-hidden="true"
    >
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-text" : "bg-transparent"} />
      ))}
    </div>
  );
}
