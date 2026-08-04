"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ImagePlus, Loader2, ScanLine, Sparkles, X } from "lucide-react";
import { useVault } from "@/lib/store";
import { useKeyVault } from "@/lib/keyvault";
import { uploadPhoto, usePhotoUrl } from "@/lib/photos";
import { estimateValue, formatMoney, today } from "@/lib/format";
import { categoryKey, usePurity, useT } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CATEGORIES, useShowPrices } from "@/components/vault";
import { cn, newId } from "@/lib/utils";
import type { JewelryCategory, JewelryItem } from "@/lib/types";

/**
 * One uploaded photo, decrypted for display.
 *
 * Removing takes it off the item but leaves the object in the bucket. Deleting
 * is admin-only under the 0004 policies, and an orphaned encrypted blob costs a
 * few hundred kilobytes — cheaper than a member being unable to correct a
 * mistake, or a delete racing a save and losing a photo that is still listed.
 */
function PhotoThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const t = useT();
  const { url, error } = usePhotoUrl(path);
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-xs text-muted">
          {error ? "!" : <Loader2 className="size-4 animate-spin" />}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("edit.removePhoto")}
        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

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
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { key: vaultKey } = useKeyVault();

  function set<K extends keyof JewelryItem>(key: K, value: JewelryItem[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /**
   * Uploads the chosen files and records their paths on the form.
   *
   * A new item gets its id here rather than at save time, because the storage
   * path contains the item id and each envelope is bound to its path. Minting
   * it during render would produce a different value on every pass and trip the
   * React purity rules — this runs in a change handler, which is safe.
   */
  async function addPhotos(files: File[]) {
    if (files.length === 0) return;
    if (!vaultKey) {
      setPhotoError(t("vault.locked"));
      return;
    }
    setUploading(true);
    setPhotoError(null);

    const itemId = form.id || newId();
    const added: string[] = [];
    try {
      for (const file of files) {
        added.push(await uploadPhoto(vaultKey, state.settings.familyId, itemId, file));
      }
    } catch (e) {
      // Whatever uploaded before the failure is kept: the files are already in
      // the bucket, and dropping the paths would orphan them where nothing
      // could ever find them again.
      setPhotoError(e instanceof Error ? e.message : String(e));
    } finally {
      if (added.length > 0) {
        setForm((f) => ({ ...f, id: itemId, photos: [...f.photos, ...added] }));
      }
      setUploading(false);
    }
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
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-3">
                {form.photos.map((path) => (
                  <PhotoThumb
                    key={path}
                    path={path}
                    onRemove={() =>
                      set("photos", form.photos.filter((p) => p !== path))
                    }
                  />
                ))}

                <label
                  className={cn(
                    "flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center text-xs text-muted transition-colors hover:bg-surface-2",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                  <span className="px-1">{uploading ? t("edit.uploading") : t("edit.addPhoto")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    // `capture` is deliberately absent: on a phone this offers
                    // both the camera and the library, and most items are
                    // photographed once and added later.
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      void addPhotos(files);
                    }}
                  />
                </label>
              </div>

              {photoError ? (
                <p role="alert" className="text-xs text-danger">
                  {photoError}
                </p>
              ) : null}
              <p className="text-xs text-muted">{t("edit.photosNote")}</p>
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
