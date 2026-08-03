"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui";
import { ItemRow, StatusBadge } from "@/components/vault";
import { cn } from "@/lib/utils";

type Mode = "lookup" | "verify";

export default function ScanPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Scan />
    </Suspense>
  );
}

function Scan() {
  const prefill = useSearchParams().get("id");
  const { state, itemById, recordLockerVisit } = useVault();

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
      <PageHeader
        title="Scan"
        subtitle="Every item has a stable ID, so printed labels never need reprinting."
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(
          [
            ["lookup", "Look up an item"],
            ["verify", "Verify a locker"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
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
          <p className="px-6 text-center text-sm">
            Camera preview appears here once <code className="text-xs">html5-qrcode</code> is wired
            in. Use the button below to simulate a scan.
          </p>
          <Button variant="primary" size="sm" onClick={simulateScan}>
            <QrCode className="size-4" />
            Simulate scan
          </Button>
        </div>
      </Card>

      {mode === "lookup" ? (
        item ? (
          <Card>
            <CardHeader
              title="Scanned"
              action={
                <button
                  type="button"
                  onClick={() => setScannedId(null)}
                  className="text-sm text-gold hover:underline"
                >
                  Clear
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
                    Take out
                  </Link>
                  <Link
                    href={`/movements/transfer/?id=${item.id}`}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
                  >
                    Transfer
                  </Link>
                </>
              ) : null}
              {item.status === "with_member" ? (
                <Link
                  href={`/movements/return/?id=${item.id}`}
                  className="rounded-lg bg-gold px-3 py-2 text-sm font-medium text-white"
                >
                  Return
                </Link>
              ) : null}
              <Link
                href={`/jewelry/item/?id=${item.id}`}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
              >
                Open details
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState
            title="Nothing scanned yet"
            description="Point the camera at a label, or simulate a scan above."
            icon={<QrCode className="size-8" />}
          />
        )
      ) : (
        <Card>
          <CardHeader
            title="Locker verification"
            description={`${seen.length} of ${expected.length} confirmed`}
            action={
              seen.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSeen([])}
                  className="text-sm text-gold hover:underline"
                >
                  Reset
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
            <EmptyState title="This locker is empty" />
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
                      <CheckCircle2 className="size-4" />
                      All {expected.length} items accounted for
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        recordLockerVisit(verifyLocker);
                        setSeen([]);
                      }}
                    >
                      Record visit
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                    <span>
                      <Badge tone="bg-warn/10 text-warn border-warn/30">
                        {missing.length} not yet scanned
                      </Badge>{" "}
                      Keep scanning, or investigate any that cannot be found:{" "}
                      {missing.map((m) => m.name).join(", ")}.
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
