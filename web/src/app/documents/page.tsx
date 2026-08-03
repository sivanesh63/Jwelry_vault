"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Upload } from "lucide-react";
import { itemsMissingDocuments, useVault } from "@/lib/store";
import { daysBetween, formatDate, today } from "@/lib/format";
import { docTypeKey, useT } from "@/lib/i18n";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui";
import type { DocumentType } from "@/lib/types";

const DOC_TYPES: DocumentType[] = ["invoice", "hallmark", "insurance", "warranty", "other"];

export default function DocumentsPage() {
  const { state, itemById } = useVault();
  const t = useT();
  const [type, setType] = useState<DocumentType | "all">("all");

  const missing = itemsMissingDocuments(state);
  const docs = state.documents
    .filter((d) => type === "all" || d.type === type)
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const expiring = state.documents.filter((d) => {
    if (!d.expiresOn) return false;
    const days = daysBetween(today(), d.expiresOn);
    return days >= 0 && days <= 60;
  });

  return (
    <>
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle", {
          files: state.documents.length,
          items: new Set(state.documents.map((d) => d.jewelryId)).size,
        })}
        action={
          <Button variant="primary">
            <Upload className="size-4" />
            {t("common.upload")}
          </Button>
        }
      />

      {expiring.length > 0 ? (
        <Card className="mb-4 border-warn/30 bg-warn/5">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="font-medium text-warn">
                {t("documents.expiringTitle", { n: expiring.length })}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {expiring.map((d) => (
                  <li key={d.id}>
                    {itemById(d.jewelryId)?.name ?? t("common.item")} — {t(docTypeKey(d.type))},{" "}
                    {t("documents.expiresOn", { date: formatDate(d.expiresOn) })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {missing.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title={t("documents.missingTitle")}
            description={t("documents.missingDesc", { n: missing.length })}
          />
          <ul className="divide-y divide-border">
            {missing.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link
                  href={`/jewelry/item/?id=${item.id}`}
                  className="truncate text-sm hover:underline"
                >
                  {item.name}
                </Link>
                <Button size="sm" variant="ghost">
                  {t("common.upload")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-3">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType | "all")}
          className="sm:max-w-xs"
        >
          <option value="all">{t("documents.allTypes")}</option>
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(docTypeKey(d))}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {docs.length === 0 ? (
          <EmptyState title={t("documents.none")} description={t("documents.noneDesc")} />
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.fileName}</p>
                  <p className="truncate text-xs text-muted">
                    <Link href={`/jewelry/item/?id=${doc.jewelryId}`} className="hover:underline">
                      {itemById(doc.jewelryId)?.name ?? t("documents.archivedItem")}
                    </Link>
                    {" · "}
                    {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                <Badge>{t(docTypeKey(doc.type))}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
