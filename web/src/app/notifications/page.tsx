"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BellOff,
  CalendarDays,
  Clock,
  FileWarning,
  Smartphone,
  Vault,
} from "lucide-react";
import { useVault } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { notifKindKey, useNotificationText, useT } from "@/lib/i18n";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<AppNotification["kind"], { icon: typeof Clock; tone: string }> = {
  overdue: { icon: AlertTriangle, tone: "text-danger" },
  due_soon: { icon: Clock, tone: "text-warn" },
  event_upcoming: { icon: CalendarDays, tone: "text-gold" },
  locker_visit: { icon: Vault, tone: "text-info" },
  missing_document: { icon: FileWarning, tone: "text-muted" },
  document_expiring: { icon: FileWarning, tone: "text-warn" },
};

export default function NotificationsPage() {
  const { state, markNotificationRead, markAllNotificationsRead } = useVault();
  const t = useT();
  const notificationText = useNotificationText();

  const sorted = state.notifications.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = sorted.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title={t("notifications.title")}
        subtitle={
          unread > 0 ? t("notifications.unread", { n: unread }) : t("notifications.allCaughtUp")
        }
        action={
          unread > 0 ? (
            <Button size="sm" onClick={markAllNotificationsRead}>
              {t("notifications.markAllRead")}
            </Button>
          ) : null
        }
      />

      {/*
        iOS only delivers Web Push to a PWA that has been added to the home
        screen. Surfacing that here means it gets set up rather than silently
        failing for half the family.
      */}
      <Card className="mb-4 border-gold/30 bg-gold-soft">
        <div className="flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-gold-deep" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gold-deep">{t("notifications.pushTitle")}</p>
            <p className="mt-0.5 text-sm text-muted">{t("notifications.pushBody")}</p>
            <Button size="sm" variant="primary" className="mt-3">
              {t("notifications.enable")}
            </Button>
          </div>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          title={t("notifications.empty")}
          description={t("notifications.emptyDesc")}
          icon={<BellOff className="size-8" />}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {sorted.map((n) => {
              const meta = KIND_META[n.kind];
              const Icon = meta.icon;
              const { title, body } = notificationText(n);
              const href = n.jewelryId
                ? `/jewelry/item/?id=${n.jewelryId}`
                : n.eventId
                  ? `/events/item/?id=${n.eventId}`
                  : "/lockers/";

              return (
                <li key={n.id} className={cn(!n.readAt && "bg-gold-soft/40")}>
                  <Link
                    href={href}
                    onClick={() => markNotificationRead(n.id)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <Icon className={cn("mt-0.5 size-5 shrink-0", meta.tone)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{title}</p>
                        {!n.readAt ? (
                          <span className="size-2 shrink-0 rounded-full bg-gold" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{body}</p>
                      <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <Badge>{t(notifKindKey(n.kind))}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted">{t("notifications.footer")}</p>
    </>
  );
}
