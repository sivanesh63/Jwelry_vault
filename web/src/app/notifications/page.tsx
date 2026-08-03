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
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  AppNotification["kind"],
  { icon: typeof Clock; tone: string; label: string }
> = {
  overdue: { icon: AlertTriangle, tone: "text-danger", label: "Overdue" },
  due_soon: { icon: Clock, tone: "text-warn", label: "Due soon" },
  event_upcoming: { icon: CalendarDays, tone: "text-gold", label: "Event" },
  locker_visit: { icon: Vault, tone: "text-info", label: "Locker" },
  missing_document: { icon: FileWarning, tone: "text-muted", label: "Document" },
  document_expiring: { icon: FileWarning, tone: "text-warn", label: "Document" },
};

export default function NotificationsPage() {
  const { state, markNotificationRead, markAllNotificationsRead } = useVault();

  const sorted = state.notifications
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = sorted.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
        action={
          unread > 0 ? (
            <Button size="sm" onClick={markAllNotificationsRead}>
              Mark all read
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
            <p className="text-sm font-medium text-gold-deep">Turn on push notifications</p>
            <p className="mt-0.5 text-sm text-muted">
              On iPhone, add this app to your Home Screen first — Safari only delivers push to
              installed apps. Then allow notifications when prompted.
            </p>
            <Button size="sm" variant="primary" className="mt-3">
              Enable notifications
            </Button>
          </div>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          title="Nothing to report"
          description="Reminders about overdue items, events and locker visits appear here."
          icon={<BellOff className="size-8" />}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {sorted.map((n) => {
              const meta = KIND_META[n.kind];
              const Icon = meta.icon;
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
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        {!n.readAt ? <span className="size-2 shrink-0 rounded-full bg-gold" /> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <Badge>{meta.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted">
        Reminders are sent by a scheduled Cloudflare Worker, not by this app — so they arrive even
        when nobody has it open.
      </p>
    </>
  );
}
