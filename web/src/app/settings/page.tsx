"use client";

import { useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Languages,
  LockKeyhole,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  TrendingUp,
} from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { useKeyVault, type DeviceSummary } from "@/lib/keyvault";
import { estimateValue, formatBytes, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { LANG_LABEL, useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { Button, Card, CardHeader, Field, Input, Meter, PageHeader } from "@/components/ui";

/** Supabase's free Storage allowance, in decimal bytes as they quote it. */
const FREE_TIER_BYTES = 1_000_000_000;
import { cn } from "@/lib/utils";

const THEMES: { value: Theme; label: MessageKey; icon: typeof Sun }[] = [
  { value: "system", label: "settings.themeSystem", icon: Monitor },
  { value: "light", label: "settings.themeLight", icon: Sun },
  { value: "dark", label: "settings.themeDark", icon: Moon },
];

export default function SettingsPage() {
  const { state, updateSettings, currentUser } = useVault();
  const { devices, removeDevice, lock } = useKeyVault();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const showPrices = state.settings.showPrices;

  const [rate, setRate] = useState(String(state.settings.goldRatePerGram24k));
  const [familyName, setFamilyName] = useState(state.settings.familyName);
  const [dueSoon, setDueSoon] = useState(String(state.settings.dueSoonLeadDays));

  const items = activeItems(state);
  const totalValue = items.reduce((s, i) => s + estimateValue(i, state.settings), 0);

  // Summed from sizes recorded at upload. Supabase has no client-side "how big
  // is this bucket" call, and the alternative — one list request per item — is
  // a hundred round trips to render one number.
  const storage = state.jewelry.reduce(
    (acc, item) => {
      const sizes = Object.values(item.photoSizes ?? {});
      return {
        bytes: acc.bytes + sizes.reduce((n, b) => n + b, 0),
        photos: acc.photos + item.photos.length,
        items: acc.items + (item.photos.length > 0 ? 1 : 0),
      };
    },
    { bytes: 0, photos: 0, items: 0 },
  );
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
            <CardHeader title={t("settings.storage")} description={t("settings.storageDesc")} />
            <div className="space-y-3 p-4">
              {/* Wraps: "384 KB of 1 GB" beside "12 photos across 8 items" does
                  not fit on a 320px phone, and neither span can shrink. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="text-lg font-semibold tabular-nums">
                  {t("settings.storageUsed", {
                    used: formatBytes(storage.bytes),
                    total: formatBytes(FREE_TIER_BYTES),
                  })}
                </span>
                <span className="text-sm text-muted">
                  {t("settings.storagePhotos", { n: storage.photos, items: storage.items })}
                </span>
              </div>

              <Meter value={storage.bytes} max={FREE_TIER_BYTES} />

              {/*
                Headroom in photos, not in megabytes. "812 MB free" needs
                arithmetic before it answers the only question anyone has, which
                is whether there is room to keep going.
              */}
              {storage.photos > 0 ? (
                <p className="text-sm text-muted">
                  {t("settings.storageRoom", {
                    n: Math.max(
                      0,
                      Math.floor((FREE_TIER_BYTES - storage.bytes) / (storage.bytes / storage.photos)),
                    ).toLocaleString(),
                  })}
                </p>
              ) : null}
            </div>
          </Card>

          {/*
            This replaced a "reset to sample data" card. That button was safe
            while the store was fixtures and would now delete a real family's
            jewelry, so it is gone rather than guarded — the safest destructive
            button is the one that does not exist.
          */}
          <Card>
            <CardHeader title={t("vault.devices")} description={t("vault.pinBody")} />
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted">
                {t("settings.signedInAs", {
                  name: currentUser.displayName,
                  role: t(
                    currentUser.role === "admin" ? "members.roleAdmin" : "members.roleMember",
                  ),
                })}
              </p>

              {devices.length === 0 ? (
                <p className="text-sm text-muted">{t("vault.deviceNone")}</p>
              ) : (
                <ul className="space-y-2">
                  {devices.map((d: DeviceSummary) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <Smartphone className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {d.label || t("vault.pinDeviceNamePlaceholder")}
                        </span>
                        <span className="block text-xs text-muted">
                          {d.lockedUntil
                            ? t("vault.deviceLockedUntil", { when: d.lockedUntil.slice(0, 10) })
                            : d.lastUsedAt
                              ? t("vault.deviceLastUsed", { when: d.lastUsedAt.slice(0, 10) })
                              : t("vault.deviceNever")}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-sm text-danger underline"
                        onClick={() => void removeDevice(d.id)}
                      >
                        {t("vault.deviceRemove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Button onClick={lock}>
                <LockKeyhole className="size-4 shrink-0" />
                {t("vault.lock")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
