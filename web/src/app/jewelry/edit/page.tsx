"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ImagePlus, ScanLine, Sparkles } from "lucide-react";
import { useVault } from "@/lib/store";
import { estimateValue, formatMoney, today } from "@/lib/format";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { CATEGORY_LABEL } from "@/components/vault";
import { newId } from "@/lib/utils";
import type { JewelryCategory, JewelryItem } from "@/lib/types";

export default function EditJewelryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <EditJewelry />
    </Suspense>
  );
}

function EditJewelry() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? undefined;
  const { state, itemById, saveItem, currentUser } = useVault();

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
      id: form.id || newId("j"),
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
        {existing ? existing.name : "Jewelry"}
      </Link>

      <h1 className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">
        {isNew ? "Add jewelry" : "Edit jewelry"}
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Photos" description="Compressed on upload to stay inside free storage" />
            <div className="flex gap-3 p-4">
              <button
                type="button"
                className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted transition-colors hover:bg-surface-2"
              >
                <ImagePlus className="size-5" />
                Add photo
              </button>
              <p className="max-w-xs self-center text-xs text-muted">
                Photos are resized to roughly 400&nbsp;KB in the browser before upload — the
                difference between fitting ~600 photos in the free tier and ~80.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Basics"
              action={
                <Button type="button" size="sm" variant="ghost" onClick={simulateScan}>
                  <ScanLine className="size-4" />
                  Scan invoice
                </Button>
              }
            />
            <div className="space-y-3 p-4">
              <Field label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Temple work haram"
                  autoFocus={isNew}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <Select
                    value={form.category}
                    onChange={(e) => set("category", e.target.value as JewelryCategory)}
                  >
                    {(Object.keys(CATEGORY_LABEL) as JewelryCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Owner" hint="Who it belongs to, not who is wearing it">
                  <Select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                    {state.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {isNew ? (
                <Field label="Stored in">
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
              <Field label="Notes">
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Handling instructions, which set it belongs to…"
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Weight and purity" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Gross weight (g)" required>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.grossWeight || ""}
                  onChange={(e) => set("grossWeight", Number(e.target.value))}
                  className={fieldTone(scanned, "grossWeight")}
                />
              </Field>
              <Field label="Stone weight (g)">
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
              <Field label="Net gold weight (g)" hint="Used for valuation">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.netGoldWeight || ""}
                  onChange={(e) => set("netGoldWeight", Number(e.target.value))}
                />
              </Field>
              <Field label="Purity (K)">
                <Select value={form.purity} onChange={(e) => set("purity", Number(e.target.value))}>
                  {[24, 22, 21, 18, 14].map((k) => (
                    <option key={k} value={k}>
                      {k}K
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-3">
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Sparkles className="size-4" />
                Estimated value
              </span>
              <span className="tabular font-semibold">{formatMoney(preview)}</span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Purchase and provenance" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Hallmark number">
                <Input
                  value={form.hallmarkNo ?? ""}
                  onChange={(e) => set("hallmarkNo", e.target.value)}
                  className={fieldTone(scanned, "hallmarkNo")}
                />
              </Field>
              <Field label="Jeweler">
                <Input
                  value={form.jeweler ?? ""}
                  onChange={(e) => set("jeweler", e.target.value)}
                />
              </Field>
              <Field label="Purchase date">
                <Input
                  type="date"
                  value={form.purchaseDate ?? ""}
                  onChange={(e) => set("purchaseDate", e.target.value)}
                  className={fieldTone(scanned, "purchaseDate")}
                />
              </Field>
              <Field label="Purchase price">
                <Input
                  type="number"
                  min="0"
                  value={form.purchasePrice ?? ""}
                  onChange={(e) => set("purchasePrice", Number(e.target.value))}
                  className={fieldTone(scanned, "purchasePrice")}
                />
              </Field>
            </div>
            {scanned.length > 0 ? (
              <p className="border-t border-border px-4 py-2.5 text-xs text-gold-deep">
                Highlighted fields came from the scanned invoice — check them before saving.
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {isNew ? "Add item" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** Tints inputs whose value came from OCR rather than from the user. */
function fieldTone(scanned: string[], key: string): string {
  return scanned.includes(key) ? "border-gold bg-gold-soft" : "";
}
