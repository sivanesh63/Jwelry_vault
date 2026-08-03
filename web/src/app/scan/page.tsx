"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui";
import { ItemRow, StatusBadge } from "@/components/vault";
import { cn } from "@/lib/utils";

type Mode = "lookup" | "verify";

export default function ScanPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
      <Scan />
    </Suspense>
  );
}

function Scan() {
  const prefill = useSearchParams().get("id");
  const { state, itemById, recordLockerVisit } = useVault();
  const t = useT();

  const [mode, setMode] = useState<Mode>("lookup");
  const [scannedId, setScannedId] = useState<string | null>(prefill);
  const [verifyLocker, setVerifyLocker] = useState(state.lockers[0]?.id ?? "");
  const [seen, setSeen] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);

  const item = itemById(scannedId ?? undefined);
  const expected = activeItems(state).filter(
    (i) => i.currentLockerId === verifyLocker && i.status === "in_locker",
  );
  const missing = expected.filter((i) => !seen.includes(i.id));

  /**
   * Stands in for html5-qrcode. Steps through items in order rather than picking
   * randomly, so a demo run is repeatable.
   */
  function simulateScan() {
    if (mode === "verify") {
      const next = expected.find((i) => !seen.includes(i.id));
      if (next) setSeen((prev) => [...prev, next.id]);
      return;
    }
    const pool = activeItems(state);
    if (pool.length === 0) return;
    setScannedId(pool[cursor % pool.length].id);
    setCursor((c) => c + 1);
  }

  return (
    <>
      <PageHeader title={t("scan.title")} subtitle={t("scan.subtitle")} />

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(
          [
            ["lookup", t("scan.modeLookup")],
            ["verify", t("scan.modeVerify")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key as Mode)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === key ? "bg-gold-soft text-gold-deep" : "text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Camera viewfinder placeholder — html5-qrcode mounts here in Phase 3. */}
      <Card className="mb-4">
        <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-surface-2 text-muted">
          <div className="relative">
            <Camera className="size-10" />
            <ScanLine className="absolute inset-x-0 top-1/2 size-10 animate-pulse text-gold" />
          </div>
          <p className="max-w-md px-6 text-center text-sm">{t("scan.cameraNote")}</p>
          <Button variant="primary" size="sm" onClick={simulateScan}>
            <QrCode className="size-4" />
            {t("scan.simulate")}
          </Button>
        </div>
      </Card>

      {mode === "lookup" ? (
        item ? (
          <Card>
            <CardHeader
              title={t("scan.scanned")}
              action={
                <button
                  type="button"
                  onClick={() => setScannedId(null)}
                  className="text-sm text-gold hover:underline"
                >
                  {t("common.clear")}
                </button>
              }
            />
            <ItemRow item={item} href={`/jewelry/item/?id=${item.id}`} />
            {/* Contextual quick-actions: the scan resolves to what you'd do next. */}
            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              {item.status === "in_locker" ? (
                <>
                  <Link
                    href={`/movements/takeout/?id=${item.id}`}
                    className="rounded-lg bg-gold px-3 py-2 text-sm font-medium text-white"
                  >
                    {t("item.takeOut")}
                  </Link>
                  <Link
                    href={`/movements/transfer/?id=${item.id}`}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
                  >
                    {t("item.transfer")}
                  </Link>
                </>
              ) : null}
              {item.status === "with_member" ? (
                <Link
                  href={`/movements/return/?id=${item.id}`}
                  className="rounded-lg bg-gold px-3 py-2 text-sm font-medium text-white"
                >
                  {t("item.return")}
                </Link>
              ) : null}
              <Link
                href={`/jewelry/item/?id=${item.id}`}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
              >
                {t("scan.openDetails")}
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState
            title={t("scan.nothingScanned")}
            description={t("scan.nothingScannedDesc")}
            icon={<QrCode className="size-8" />}
          />
        )
      ) : (
        <Card>
          <CardHeader
            title={t("scan.verification")}
            description={t("scan.confirmedOf", { seen: seen.length, total: expected.length })}
            action={
              seen.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSeen([])}
                  className="text-sm text-gold hover:underline"
                >
                  {t("common.reset")}
                </button>
              ) : null
            }
          />
          <div className="border-b border-border p-3">
            <Select
              value={verifyLocker}
              onChange={(e) => {
                setVerifyLocker(e.target.value);
                setSeen([]);
              }}
            >
              {state.lockers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>

          {expected.length === 0 ? (
            <EmptyState title={t("scan.emptyLocker")} />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {expected.map((i) => {
                  const found = seen.includes(i.id);
                  return (
                    <li
                      key={i.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        found ? "bg-ok/5" : undefined,
                      )}
                    >
                      {found ? (
                        <CheckCircle2 className="size-5 shrink-0 text-ok" />
                      ) : (
                        <span className="size-5 shrink-0 rounded-full border border-border" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
                      <StatusBadge item={i} />
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-border p-4">
                {missing.length === 0 ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-sm font-medium text-ok">
                      <CheckCircle2 className="size-4 shrink-0" />
                      {t("scan.allAccounted", { n: expected.length })}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        recordLockerVisit(verifyLocker);
                        setSeen([]);
                      }}
                    >
                      {t("scan.recordVisit")}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                    <span>
                      <Badge tone="bg-warn/10 text-warn border-warn/30">
                        {t("scan.notScanned", { n: missing.length })}
                      </Badge>{" "}
                      {t("scan.keepScanning", { names: missing.map((m) => m.name).join(", ") })}
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
