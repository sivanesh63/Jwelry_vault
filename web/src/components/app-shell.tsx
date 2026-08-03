"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  FileText,
  Gem,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  QrCode,
  ScrollText,
  Settings as SettingsIcon,
  Users,
  Vault,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/store";
import { Avatar } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gem;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jewelry", label: "Jewelry", icon: Gem },
  { href: "/movements", label: "Movements", icon: ListChecks },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/lockers", label: "Lockers", icon: Vault },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/members", label: "Family members", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/scan", label: "Scan QR", icon: QrCode },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/** Bottom bar on phones: four destinations plus a "More" sheet. */
const TAB_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/jewelry", label: "Jewelry", icon: Gem },
  { href: "/scan", label: "Scan", icon: QrCode },
  { href: "/movements", label: "Movements", icon: ListChecks },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Routes that render standalone, without navigation chrome. */
const BARE_ROUTES = ["/login", "/onboarding"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, currentUser, switchUser } = useVault();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const unread = state.notifications.filter((n) => !n.readAt).length;

  if (BARE_ROUTES.some((r) => pathname.startsWith(r))) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold text-white">
            <Vault className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold">{state.settings.familyName}</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <div className="my-2 border-t border-border" />
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <div className="border-t border-border p-2">
          <UserSwitcher
            open={userMenuOpen}
            onToggle={() => setUserMenuOpen((v) => !v)}
            onSelect={(id) => {
              switchUser(id);
              setUserMenuOpen(false);
            }}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gold text-white">
              <Vault className="size-3.5" />
            </span>
            <span className="truncate text-sm font-semibold">{state.settings.familyName}</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell unread={unread} />
            <Avatar initials={currentUser.initials} />
          </div>
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b border-border bg-surface/95 px-6 py-3 backdrop-blur lg:flex">
          <NotificationBell unread={unread} />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {TAB_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-gold" : "text-muted",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted"
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </nav>
      </div>

      {/* "More" sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">More</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X className="size-5 text-muted" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...PRIMARY_NAV.slice(3), ...SECONDARY_NAV].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium"
                  >
                    <Icon className="size-4 text-muted" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <UserSwitcher
                open={userMenuOpen}
                onToggle={() => setUserMenuOpen((v) => !v)}
                onSelect={(id) => {
                  switchUser(id);
                  setUserMenuOpen(false);
                  setMoreOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-gold-soft text-gold-deep" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      className="relative flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
    >
      <Bell className="size-5" />
      {unread > 0 ? (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
          {unread}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Switches the acting user. This stands in for real auth so that role-dependent
 * UI (admin-only actions, "with you" framing) can be exercised in the prototype.
 */
function UserSwitcher({
  open,
  onToggle,
  onSelect,
}: {
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const { state, currentUser } = useVault();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <Avatar initials={currentUser.initials} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{currentUser.displayName}</span>
          <span className="block text-xs capitalize text-muted">{currentUser.role}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <p className="border-b border-border px-3 py-2 text-xs text-muted">
            Viewing as (prototype only)
          </p>
          {state.users
            .filter((u) => u.isActive)
            .map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelect(u.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                  u.id === currentUser.id && "bg-gold-soft",
                )}
              >
                <Avatar initials={u.initials} className="size-6 text-[10px]" />
                <span className="truncate">{u.displayName}</span>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
