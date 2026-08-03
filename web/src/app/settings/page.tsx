"use client";

import { useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Languages,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  TrendingUp,
} from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { estimateValue, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { LANG_LABEL, useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

const THEMES: { value: Theme; label: MessageKey; icon: typeof Sun }[] = [
  { value: "system", label: "settings.themeSystem", icon: Monitor },
  { value: "light", label: "settings.themeLight", icon: Sun },
  { value: "dark", label: "settings.themeDark", icon: Moon },
];

export default function SettingsPage() {
  const { state, updateSettings, resetDemo, currentUser } = useVault();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const showPrices = state.settings.showPrices;

  const [rate, setRate] = useState(String(state.settings.goldRatePerGram24k));
  const [familyName, setFamilyName] = useState(state.settings.familyName);
  const [dueSoon, setDueSoon] = useState(String(state.settings.dueSoonLeadDays));
  const [resetOpen, setResetOpen] = useState(false);

  const items = activeItems(state);
  const totalValue = items.reduce((s, i) => s + estimateValue(i, state.settings), 0);
  const previewValue = items.reduce(
    (s, i) => s + estimateValue(i, { ...state.settings, goldRatePerGram24k: Number(rate) || 0 }),
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
    // The price column is omitted entirely when prices are hidden, so an export
    // can't leak what the app deliberately does not show.
    const header = [
      t("edit.name"),
      t("edit.category"),
      t("item.grossWeight"),
      t("item.netGoldWeight"),
      t("item.purity"),
      t("common.status"),
      t("common.location"),
      t("item.hallmark"),
      ...(showPrices ? [t("dashboard.estValue")] : []),
    ];
    const rows = items.map((i) => [
      i.name,
      i.category === "other" && i.customCategory ? i.customCategory : i.category,
      i.grossWeight,
      i.netGoldWeight,
      i.purity,
      i.status,
      i.currentLockerId ?? i.currentHolderId ?? "",
      i.hallmarkNo ?? "",
      ...(showPrices ? [Math.round(estimateValue(i, state.settings))] : []),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // BOM so Excel opens Tamil column headers correctly rather than as mojibake.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jewelry-vault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("settings.language")} description={t("settings.languageDesc")} />
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LANG_LABEL) as Lang[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                      lang === code
                        ? "border-gold bg-gold-soft text-gold-deep"
                        : "border-border bg-surface text-muted hover:bg-surface-2",
                    )}
                  >
                    <Languages className="size-4 shrink-0" />
                    {LANG_LABEL[code]}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t("settings.theme")} description={t("settings.themeDesc")} />
            <div className="grid grid-cols-3 gap-2 p-4">
              {THEMES.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors",
                      active
                        ? "border-gold bg-gold-soft text-gold-deep"
                        : "border-border bg-surface text-muted hover:bg-surface-2",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {t(option.label)}
                  </button>
                );
              })}
            </div>
          </Card>

          {/*
            Prices are opt-in. The gold rate card only appears once they are on,
            since a valuation nobody can see is not worth maintaining.
          */}
          <Card>
            <CardHeader title={t("settings.prices")} description={t("settings.pricesDesc")} />
            <div className="p-4">
              <button
                type="button"
                role="switch"
                aria-checked={showPrices}
                onClick={() => updateSettings({ showPrices: !showPrices })}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {showPrices ? (
                    <Eye className="size-4 shrink-0 text-gold" />
                  ) : (
                    <EyeOff className="size-4 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t("settings.pricesToggle")}</span>
                    <span className="block text-xs text-muted">
                      {showPrices ? t("settings.pricesOn") : t("settings.pricesOff")}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    showPrices ? "bg-gold" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                      showPrices ? "left-[1.375rem]" : "left-0.5",
                    )}
                  />
                </span>
              </button>
              <p className="mt-3 text-xs text-muted">{t("settings.pricesHint")}</p>
            </div>
          </Card>

          {showPrices ? (
          <Card>
            <CardHeader
              title={t("settings.goldRate")}
              description={t("settings.goldRateUpdated", {
                date: formatDate(state.settings.goldRateUpdatedOn),
              })}
            />
            <div className="space-y-3 p-4">
              <Field label={t("settings.ratePerGram")} hint={t("settings.ratePerGramHint")}>
                <Input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingUp className="size-4 shrink-0" />
                    {t("settings.vaultValue")}
                  </span>
                  <span className="tabular font-semibold">{formatMoney(totalValue)}</span>
                </div>
                {rateChanged ? (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                    <span className="text-muted">{t("settings.atNewRate")}</span>
                    <span
                      className={cn(
                        "tabular font-semibold",
                        previewValue >= totalValue ? "text-ok" : "text-danger",
                      )}
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
                {t("settings.updateRate")}
              </Button>
            </div>
          </Card>
          ) : null}

          <Card>
            <CardHeader title={t("settings.family")} />
            <div className="space-y-3 p-4">
              <Field label={t("settings.vaultName")}>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
              </Field>
              <Field label={t("settings.dueSoonLead")}>
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
                {t("common.save")}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("settings.export")} description={t("settings.exportDesc")} />
            <div className="space-y-2 p-4">
              <Button className="w-full justify-start" onClick={exportJson}>
                <Download className="size-4 shrink-0" />
                {t("settings.downloadJson")}
              </Button>
              <Button className="w-full justify-start" onClick={exportCsv}>
                <FileSpreadsheet className="size-4 shrink-0" />
                {t("settings.downloadCsv")}
              </Button>
              <p className="pt-1 text-xs text-muted">{t("settings.exportNote")}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title={t("settings.prototype")} description={t("settings.prototypeDesc")} />
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted">
                {t("settings.signedInAs", {
                  name: currentUser.displayName,
                  role: t(
                    currentUser.role === "admin" ? "members.roleAdmin" : "members.roleMember",
                  ),
                })}
              </p>
              <Button variant="danger" onClick={() => setResetOpen(true)}>
                <RotateCcw className="size-4 shrink-0" />
                {t("settings.resetDemo")}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("settings.resetTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setResetOpen(false);
              }}
            >
              {t("common.reset")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t("settings.resetBody")}</p>
      </Modal>
    </>
  );
}
