"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, RotateCcw, TrendingUp } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { estimateValue, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
} from "@/components/ui";

export default function SettingsPage() {
  const { state, updateSettings, resetDemo, currentUser } = useVault();

  const [rate, setRate] = useState(String(state.settings.goldRatePerGram24k));
  const [familyName, setFamilyName] = useState(state.settings.familyName);
  const [dueSoon, setDueSoon] = useState(String(state.settings.dueSoonLeadDays));
  const [resetOpen, setResetOpen] = useState(false);

  const items = activeItems(state);
  const totalValue = items.reduce((s, i) => s + estimateValue(i, state.settings), 0);
  const previewValue = items.reduce(
    (s, i) =>
      s + estimateValue(i, { ...state.settings, goldRatePerGram24k: Number(rate) || 0 }),
    0,
  );
  const rateChanged = Number(rate) !== state.settings.goldRatePerGram24k;

  /** Downloads the full vault as JSON — the same shape the nightly backup writes. */
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jewelry-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** CSV rather than xlsx here; SheetJS produces real .xlsx in Phase 3. */
  function exportCsv() {
    const header = [
      "Name",
      "Category",
      "Gross (g)",
      "Net gold (g)",
      "Purity",
      "Status",
      "Location",
      "Hallmark",
      "Estimated value",
    ];
    const rows = items.map((i) => [
      i.name,
      i.category,
      i.grossWeight,
      i.netGoldWeight,
      `${i.purity}K`,
      i.status,
      i.currentLockerId ?? i.currentHolderId ?? "",
      i.hallmarkNo ?? "",
      Math.round(estimateValue(i, state.settings)),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jewelry-vault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Gold rate"
              description={`Last updated ${formatDate(state.settings.goldRateUpdatedOn)}`}
            />
            <div className="space-y-3 p-4">
              <Field
                label="Rate per gram (24K)"
                hint="Maintained by hand for now; automatic rate fetching is a later enhancement."
              >
                <Input
                  type="number"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingUp className="size-4" />
                    Vault value
                  </span>
                  <span className="tabular font-semibold">{formatMoney(totalValue)}</span>
                </div>
                {rateChanged ? (
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted">At new rate</span>
                    <span
                      className={
                        previewValue >= totalValue
                          ? "tabular font-semibold text-ok"
                          : "tabular font-semibold text-danger"
                      }
                    >
                      {formatMoney(previewValue)} ({previewValue >= totalValue ? "+" : ""}
                      {formatMoneyShort(previewValue - totalValue)})
                    </span>
                  </div>
                ) : null}
              </div>

              <Button
                variant="primary"
                disabled={!rateChanged || Number(rate) <= 0}
                onClick={() => updateSettings({ goldRatePerGram24k: Number(rate) })}
              >
                Update rate
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Family" />
            <div className="space-y-3 p-4">
              <Field label="Vault name">
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
              </Field>
              <Field label="Warn me this many days before an item is due">
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={dueSoon}
                  onChange={(e) => setDueSoon(e.target.value)}
                />
              </Field>
              <Button
                disabled={
                  familyName === state.settings.familyName &&
                  Number(dueSoon) === state.settings.dueSoonLeadDays
                }
                onClick={() =>
                  updateSettings({
                    familyName: familyName.trim() || state.settings.familyName,
                    dueSoonLeadDays: Number(dueSoon),
                  })
                }
              >
                Save
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Export"
              description="A nightly job writes the same JSON automatically once deployed."
            />
            <div className="space-y-2 p-4">
              <Button className="w-full justify-start" onClick={exportJson}>
                <Download className="size-4" />
                Download full backup (JSON)
              </Button>
              <Button className="w-full justify-start" onClick={exportCsv}>
                <FileSpreadsheet className="size-4" />
                Download inventory (CSV)
              </Button>
              <p className="pt-1 text-xs text-muted">
                Keeping an off-platform copy is what makes the vault portable — you can move to any
                other provider with it.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Prototype" description="Not part of the finished app" />
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted">
                Data lives in this browser only. Signed in as{" "}
                <strong className="text-text">{currentUser.displayName}</strong> ({currentUser.role}).
                Switch users from the sidebar to see role-dependent screens.
              </p>
              <Button variant="danger" onClick={() => setResetOpen(true)}>
                <RotateCcw className="size-4" />
                Reset to sample data
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset to sample data?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setResetOpen(false);
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Every change you have made in this browser will be discarded and the original sample data
          restored.
        </p>
      </Modal>
    </>
  );
}
