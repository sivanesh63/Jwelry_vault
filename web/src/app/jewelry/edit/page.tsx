"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ImagePlus, ScanLine, Sparkles } from "lucide-react";
import { useVault } from "@/lib/store";
import { estimateValue, formatMoney, today } from "@/lib/format";
import { categoryKey, usePurity, useT } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CATEGORIES, useShowPrices } from "@/components/vault";
import { newId } from "@/lib/utils";
import type { JewelryCategory, JewelryItem } from "@/lib/types";

export default function EditJewelryPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
      <EditJewelry />
    </Suspense>
  );
}

function EditJewelry() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? undefined;
  const { state, itemById, saveItem, currentUser } = useVault();
  const t = useT();
  const purity = usePurity();
  const showPrices = useShowPrices();

  const existing = itemById(id);
  const isNew = !existing;

  // New items carry an empty id until save; generating one during render would
  // produce a different value on every pass.
  const [form, setForm] = useState<JewelryItem>(
    existing ?? {
      id: "",
      familyId: state.settings.familyId,
      name: "",
      category: "necklace",
      photos: [],
      grossWeight: 0,
      netGoldWeight: 0,
      stoneWeight: 0,
      purity: 22,
      status: "in_locker",
      ownerId: currentUser.id,
      currentLockerId: state.lockers[0]?.id,
      isArchived: false,
      createdAt: "",
    },
  );
  const [scanned, setScanned] = useState<string[]>([]);

  function set<K extends keyof JewelryItem>(key: K, value: JewelryItem[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /**
   * Stands in for the tesseract.js flow: upload an invoice, extract fields,
   * prefill them, and mark them so nothing is saved unreviewed.
   */
  function simulateScan() {
    setForm((f) => ({
      ...f,
      hallmarkNo: f.hallmarkNo || "HM-4417-XZ",
      purchasePrice: f.purchasePrice || 187500,
      grossWeight: f.grossWeight || 32.6,
      purchaseDate: f.purchaseDate || today(),
    }));
    setScanned(["hallmarkNo", "purchasePrice", "grossWeight", "purchaseDate"]);
  }

  const valid = form.name.trim().length > 0 && form.grossWeight > 0;
  const preview = estimateValue(form, state.settings);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const saved: JewelryItem = {
      ...form,
      id: form.id || newId(),
      createdAt: form.createdAt || new Date().toISOString(),
    };
    saveItem(saved);
    router.push(`/jewelry/item/?id=${saved.id}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <Link
        href={existing ? `/jewelry/item/?id=${existing.id}` : "/jewelry/"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" />
        {existing ? existing.name : t("nav.jewelry")}
      </Link>

      <h1 className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">
        {isNew ? t("edit.addTitle") : t("edit.editTitle")}
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("edit.photos")} description={t("edit.photosDesc")} />
            <div className="flex gap-3 p-4">
              <button
                type="button"
                className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted transition-colors hover:bg-surface-2"
              >
                <ImagePlus className="size-5" />
                {t("edit.addPhoto")}
              </button>
              <p className="max-w-xs self-center text-xs text-muted">{t("edit.photosNote")}</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("edit.basics")}
              action={
                <Button type="button" size="sm" variant="ghost" onClick={simulateScan}>
                  <ScanLine className="size-4" />
                  {t("edit.scanInvoice")}
                </Button>
              }
            />
            <div className="space-y-3 p-4">
              <Field label={t("edit.name")} required>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("edit.namePlaceholder")}
                  autoFocus={isNew}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("edit.category")}>
                  <Select
                    value={form.category}
                    onChange={(e) => set("category", e.target.value as JewelryCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(categoryKey(c))}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("common.owner")} hint={t("edit.ownerHint")}>
                  <Select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                    {state.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {/*
                "Other" is a real category with a name, not a dead end — the
                family types what the piece is actually called and that name is
                what shows everywhere afterwards.
              */}
              {form.category === "other" ? (
                <Field label={t("edit.customCategory")} hint={t("edit.customCategoryHint")}>
                  <Input
                    value={form.customCategory ?? ""}
                    onChange={(e) => set("customCategory", e.target.value)}
                    placeholder={t("edit.customCategoryPlaceholder")}
                    autoFocus
                  />
                </Field>
              ) : null}
              {isNew ? (
                <Field label={t("edit.storedIn")}>
                  <Select
                    value={form.currentLockerId ?? ""}
                    onChange={(e) => set("currentLockerId", e.target.value)}
                  >
                    {state.lockers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label={t("item.notes")}>
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder={t("edit.notesPlaceholder")}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("edit.weightPurity")} />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label={t("edit.grossWeightG")} required>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.grossWeight || ""}
                  onChange={(e) => set("grossWeight", Number(e.target.value))}
                  className={fieldTone(scanned, "grossWeight")}
                />
              </Field>
              <Field label={t("edit.stoneWeightG")}>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.stoneWeight || ""}
                  onChange={(e) => {
                    const stone = Number(e.target.value);
                    setForm((f) => ({
                      ...f,
                      stoneWeight: stone,
                      // Net gold defaults to gross minus stones; still editable.
                      netGoldWeight: Math.max(0, Number((f.grossWeight - stone).toFixed(2))),
                    }));
                  }}
                />
              </Field>
              <Field label={t("edit.netGoldWeightG")} hint={t("edit.netGoldHint")}>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.netGoldWeight || ""}
                  onChange={(e) => set("netGoldWeight", Number(e.target.value))}
                />
              </Field>
              <Field label={t("edit.purityK")}>
                <Select value={form.purity} onChange={(e) => set("purity", Number(e.target.value))}>
                  {[24, 22, 21, 18, 14].map((k) => (
                    <option key={k} value={k}>
                      {purity(k)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {showPrices ? (
              <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-3">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <Sparkles className="size-4 shrink-0" />
                  {t("dashboard.estValue")}
                </span>
                <span className="tabular font-semibold">{formatMoney(preview)}</span>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t("edit.provenance")} />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label={t("edit.hallmarkNo")}>
                <Input
                  value={form.hallmarkNo ?? ""}
                  onChange={(e) => set("hallmarkNo", e.target.value)}
                  className={fieldTone(scanned, "hallmarkNo")}
                />
              </Field>
              <Field label={t("item.jeweler")}>
                <Input value={form.jeweler ?? ""} onChange={(e) => set("jeweler", e.target.value)} />
              </Field>
              <Field label={t("edit.purchaseDate")}>
                <Input
                  type="date"
                  value={form.purchaseDate ?? ""}
                  onChange={(e) => set("purchaseDate", e.target.value)}
                  className={fieldTone(scanned, "purchaseDate")}
                />
              </Field>
              {showPrices ? (
                <Field label={t("item.purchasePrice")}>
                  <Input
                    type="number"
                    min="0"
                    value={form.purchasePrice ?? ""}
                    onChange={(e) => set("purchasePrice", Number(e.target.value))}
                    className={fieldTone(scanned, "purchasePrice")}
                  />
                </Field>
              ) : null}
            </div>
            {scanned.length > 0 ? (
              <p className="border-t border-border px-4 py-2.5 text-xs text-gold-deep">
                {t("edit.scannedNote")}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {isNew ? t("edit.addAction") : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

/** Tints inputs whose value came from OCR rather than from the user. */
function fieldTone(scanned: string[], key: string): string {
  return scanned.includes(key) ? "border-gold bg-gold-soft" : "";
}
