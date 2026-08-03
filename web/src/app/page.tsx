"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Coins,
  Gem,
  TrendingUp,
  Vault,
} from "lucide-react";
import {
  activeItems,
  dueSoonItems,
  lockersNeedingVisit,
  overdueItems,
  upcomingEvents,
  useVault,
} from "@/lib/store";
import {
  estimateValue,
  formatDate,
  formatMoneyShort,
  formatWeight,
  today,
} from "@/lib/format";
import { useRelativeDays, useT } from "@/lib/i18n";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { ItemRow, StatTile } from "@/components/vault";

export default function DashboardPage() {
  const { state, userById } = useVault();
  const t = useT();
  const relative = useRelativeDays();

  const items = activeItems(state);
  const overdue = overdueItems(state);
  const dueSoon = dueSoonItems(state);
  const events = upcomingEvents(state);
  const lockerVisits = lockersNeedingVisit(state);

  const totalGold = items.reduce((sum, j) => sum + j.netGoldWeight, 0);
  const totalValue = items.reduce((sum, j) => sum + estimateValue(j, state.settings), 0);
  const inLocker = items.filter((j) => j.status === "in_locker").length;
  const away = items.filter(
    (j) => j.status === "with_member" || j.status === "at_jeweler" || j.status === "in_transit",
  );

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {state.settings.familyName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t("dashboard.goldRate", {
            rate: t("unit.perGram", { value: formatMoneyShort(state.settings.goldRatePerGram24k) }),
            when: relative(state.settings.goldRateUpdatedOn, today()),
          })}{" "}
          <Link href="/settings/" className="text-gold underline underline-offset-2">
            {t("common.update")}
          </Link>
        </p>
      </div>

      {/* Anything demanding action leads, ahead of the headline numbers. */}
      {overdue.length > 0 ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-danger">
                {t("dashboard.overdueTitle", { n: overdue.length })}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {overdue
                  .map(
                    (j) =>
                      `${j.name} — ${userById(j.currentHolderId)?.displayName ?? j.jeweler ?? t("common.unknown")}`,
                  )
                  .join(", ")}
              </p>
              <LinkButton href="/movements/return/" size="sm" variant="primary" className="mt-3">
                {t("dashboard.returnItems")}
              </LinkButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t("dashboard.totalItems")}
          value={String(items.length)}
          sub={t("dashboard.archived", { n: state.jewelry.length - items.length })}
          href="/jewelry/"
          icon={<Gem className="size-4" />}
        />
        <StatTile
          label={t("dashboard.netGold")}
          value={formatWeight(totalGold)}
          sub={t("dashboard.excludingStones")}
          icon={<Coins className="size-4" />}
        />
        <StatTile
          label={t("dashboard.estValue")}
          value={formatMoneyShort(totalValue)}
          sub={t("dashboard.atCurrentRate")}
          icon={<TrendingUp className="size-4" />}
        />
        <StatTile
          label={t("dashboard.outsideLocker")}
          value={String(away.length)}
          sub={t("dashboard.secured", { n: inLocker })}
          tone={away.length > 0 ? "warn" : undefined}
          href="/movements/"
          icon={<Vault className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("dashboard.outOfLocker")}
            description={t("dashboard.awayCount", { n: away.length })}
            action={
              <Link href="/movements/" className="text-sm text-gold hover:underline">
                {t("common.viewAll")}
              </Link>
            }
          />
          {away.length === 0 ? (
            <EmptyState
              title={t("dashboard.allSecured")}
              description={t("dashboard.allSecuredDesc")}
            />
          ) : (
            <div className="divide-y divide-border">
              {away
                .slice()
                .sort((a, b) =>
                  (a.expectedReturnOn ?? "9999-12-31").localeCompare(
                    b.expectedReturnOn ?? "9999-12-31",
                  ),
                )
                .map((item) => (
                  <ItemRow key={item.id} item={item} href={`/jewelry/item/?id=${item.id}`} />
                ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t("dashboard.upcomingEvents")}
              action={
                <Link href="/events/" className="text-sm text-gold hover:underline">
                  {t("common.viewAll")}
                </Link>
              }
            />
            {events.length === 0 ? (
              <EmptyState title={t("dashboard.noEvents")} />
            ) : (
              <div className="divide-y divide-border">
                {events.map((event) => {
                  const ready = event.jewelryIds.filter(
                    (id) => state.jewelry.find((j) => j.id === id)?.status === "with_member",
                  ).length;
                  return (
                    <Link
                      key={event.id}
                      href={`/events/item/?id=${event.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-deep">
                        <CalendarDays className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{event.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {formatDate(event.startsOn)} · {relative(today(), event.startsOn)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">
                        {t("dashboard.readyCount", { ready, total: event.jewelryIds.length })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.needsAttention")} />
            <div className="divide-y divide-border text-sm">
              <AttentionRow
                label={t("dashboard.dueBackSoon")}
                count={dueSoon.length}
                href="/movements/return/"
                warn={dueSoon.length > 0}
              />
              <AttentionRow
                label={t("dashboard.lockerVisitsDue")}
                count={lockerVisits.length}
                href="/lockers/"
                warn={lockerVisits.length > 0}
              />
              <AttentionRow
                label={t("dashboard.inTransitCount")}
                count={items.filter((j) => j.status === "in_transit").length}
                href="/movements/transfer/"
              />
              <AttentionRow
                label={t("dashboard.atJewelerCount")}
                count={items.filter((j) => j.status === "at_jeweler").length}
                href="/movements/"
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function AttentionRow({
  label,
  count,
  href,
  warn,
}: {
  label: string;
  count: number;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
      <span className="min-w-0">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={warn && count > 0 ? "font-semibold text-warn" : "text-muted"}>{count}</span>
        <ArrowRight className="size-4 text-muted" />
      </span>
    </Link>
  );
}
