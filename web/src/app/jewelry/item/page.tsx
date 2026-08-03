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
  addDays,
  estimateValue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatWeight,
  today,
} from "@/lib/format";
import {
  docTypeKey,
  movementTypeKey,
  statusKey,
  usePurity,
  useT,
} from "@/lib/i18n";
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
import {
  DetailRow,
  DueBadge,
  PhotoTile,
  StatusBadge,
  useCategoryLabel,
  useLocationLabel,
  useShowPrices,
} from "@/components/vault";

export default function JewelryDetailPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
      <JewelryDetail />
    </Suspense>
  );
}

function JewelryDetail() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? undefined;
  const t = useT();
  const purity = usePurity();
  const locationLabel = useLocationLabel();
  const categoryLabel = useCategoryLabel();
  const showPrices = useShowPrices();
  const {
    state,
    itemById,
    userById,
    lockerById,
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
        title={t("item.notFound")}
        description={t("item.notFoundDesc")}
        action={
          <LinkButton href="/jewelry/" variant="primary" size="sm">
            {t("item.backToJewelry")}
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
        {t("nav.jewelry")}
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
            {categoryLabel(item)} · {purity(item.purity)} · {formatWeight(item.grossWeight)}
          </p>
          {showPrices ? (
            <>
              <p className="tabular mt-3 text-2xl font-semibold">{formatMoney(value)}</p>
              <p className="text-xs text-muted">
                {t("item.estimatedFrom", { weight: formatWeight(item.netGoldWeight) })}
              </p>
            </>
          ) : (
            <p className="tabular mt-3 text-2xl font-semibold">
              {formatWeight(item.netGoldWeight)}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {item.status === "in_locker" ? (
              <>
                <LinkButton href={`/movements/takeout/?id=${item.id}`} variant="primary" size="sm">
                  {t("item.takeOut")}
                </LinkButton>
                <LinkButton href={`/movements/transfer/?id=${item.id}`} size="sm">
                  <ArrowLeftRight className="size-4" />
                  {t("item.transfer")}
                </LinkButton>
                <Button size="sm" onClick={() => setServiceOpen(true)}>
                  <Hammer className="size-4" />
                  {t("item.sendForService")}
                </Button>
              </>
            ) : null}

            {item.status === "with_member" ? (
              <>
                <LinkButton href={`/movements/return/?id=${item.id}`} variant="primary" size="sm">
                  <Undo2 className="size-4" />
                  {t("item.return")}
                </LinkButton>
                <Button size="sm" onClick={() => setExtendOpen(true)}>
                  {t("item.extendDue")}
                </Button>
              </>
            ) : null}

            {item.status === "in_transit" ? (
              <Button size="sm" variant="primary" onClick={() => confirmArrival([item.id])}>
                <PackageCheck className="size-4" />
                {t("item.confirmArrival", {
                  locker: lockerById(item.currentLockerId)?.name ?? t("return.locker"),
                })}
              </Button>
            ) : null}

            {item.status === "at_jeweler" ? (
              <Button size="sm" variant="primary" onClick={() => setCollectOpen(true)}>
                <PackageCheck className="size-4" />
                {t("item.collectFromJeweler")}
              </Button>
            ) : null}

            <LinkButton href={`/jewelry/edit/?id=${item.id}`} size="sm">
              <Pencil className="size-4" />
              {t("common.edit")}
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("item.currentPosition")} />
            <div className="px-4 py-1">
              <DetailRow label={t("common.status")} value={t(statusKey(item.status))} />
              <DetailRow label={t("common.location")} value={locationLabel(item)} />
              <DetailRow label={t("common.owner")} value={owner?.displayName ?? t("common.none")} />
              {holder ? <DetailRow label={t("item.heldBy")} value={holder.displayName} /> : null}
              {item.expectedReturnOn ? (
                <DetailRow
                  label={t("item.expectedBack")}
                  value={formatDate(item.expectedReturnOn)}
                />
              ) : null}
              {openMovement?.reason ? (
                <DetailRow label={t("common.reason")} value={openMovement.reason} />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("item.specification")} />
            <div className="px-4 py-1">
              <DetailRow label={t("item.grossWeight")} value={formatWeight(item.grossWeight)} />
              <DetailRow label={t("item.netGoldWeight")} value={formatWeight(item.netGoldWeight)} />
              <DetailRow label={t("item.stoneWeight")} value={formatWeight(item.stoneWeight)} />
              <DetailRow label={t("item.purity")} value={purity(item.purity)} />
              <DetailRow label={t("item.hallmark")} value={item.hallmarkNo ?? t("common.none")} />
              <DetailRow label={t("item.jeweler")} value={item.jeweler ?? t("common.none")} />
              <DetailRow label={t("item.purchased")} value={formatDate(item.purchaseDate)} />
              {showPrices ? (
                <DetailRow label={t("item.purchasePrice")} value={formatMoney(item.purchasePrice)} />
              ) : null}
            </div>
          </Card>

          {item.notes ? (
            <Card>
              <CardHeader title={t("item.notes")} />
              <p className="px-4 py-3 text-sm">{item.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t("item.documents")}
              description={t("item.documentsCount", { n: documents.length })}
              action={
                <Button size="sm" variant="ghost">
                  <Upload className="size-4" />
                  {t("common.upload")}
                </Button>
              }
            />
            {documents.length === 0 ? (
              <EmptyState title={t("item.noDocuments")} description={t("item.noDocumentsDesc")} />
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.fileName}</span>
                      <span className="block text-xs text-muted">
                        {t(docTypeKey(doc.type))} · {formatDate(doc.uploadedAt)}
                        {doc.expiresOn
                          ? ` · ${t("documents.expiresOn", { date: formatDate(doc.expiresOn) })}`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("item.history")} description={t("item.historyDesc")} />
            {movements.length === 0 ? (
              <EmptyState title={t("item.noMovements")} />
            ) : (
              <ol className="divide-y divide-border">
                {movements.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t(movementTypeKey(m.type))}</p>
                      <Badge>{m.returnedAt ? t("common.closed") : t("common.open")}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {m.fromLocation} → {m.toLocation}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(m.takenAt)} · {userById(m.actorId)?.displayName ?? "—"}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </p>
                    {m.returnedAt ? (
                      <p className="text-xs text-muted">
                        {t("item.closedOn", { when: formatDateTime(m.returnedAt) })}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title={t("item.label")} description={t("item.labelDesc")} />
            <div className="flex items-center gap-4 p-4">
              <QrPlaceholder value={item.id} />
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{item.id}</p>
                <LinkButton href={`/scan/?id=${item.id}`} size="sm" className="mt-2">
                  <QrCode className="size-4" />
                  {t("item.openScanner")}
                </LinkButton>
              </div>
            </div>
          </Card>

          <Button variant="danger" className="w-full" onClick={() => setArchiveOpen(true)}>
            <Archive className="size-4" />
            {t("item.archive")}
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
        title={t("item.collectTitle")}
        footer={
          <Button variant="ghost" onClick={() => setCollectOpen(false)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">{t("item.collectBody")}</p>
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
        title={t("item.archiveConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                archiveItem(item.id);
                setArchiveOpen(false);
                router.push("/jewelry/");
              }}
            >
              {t("item.archive")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t("item.archiveBody", { name: item.name })}</p>
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
  const t = useT();
  const [jeweler, setJeweler] = useState(defaultJeweler);
  const [reason, setReason] = useState("");
  const [back, setBack] = useState(addDays(today(), 7));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("item.serviceTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!jeweler.trim()}
            onClick={() => onSubmit(jeweler.trim(), reason.trim(), back)}
          >
            {t("item.send")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("item.serviceShop")} required>
          <Input
            value={jeweler}
            onChange={(e) => setJeweler(e.target.value)}
            placeholder={t("item.serviceShopPlaceholder")}
          />
        </Field>
        <Field label={t("common.reason")}>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("item.serviceReasonPlaceholder")}
          />
        </Field>
        <Field label={t("item.expectedBackLabel")}>
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
  const t = useT();
  const [date, setDate] = useState(addDays(current, 7));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("item.extendTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onSubmit(date)}>
            {t("item.extend")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {t("item.extendBody", { date: formatDate(current) })}
      </p>
      <Field label={t("item.newReturnDate")}>
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
