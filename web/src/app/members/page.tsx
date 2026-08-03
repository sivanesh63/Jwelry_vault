"use client";

import { useState } from "react";
import Link from "next/link";
import { MailPlus, ShieldCheck, UserMinus } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { estimateValue, formatMoneyShort, formatWeight } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { useShowPrices } from "@/components/vault";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

export default function MembersPage() {
  const { state, currentUser, inviteMember, deactivateMember } = useVault();
  const t = useT();
  const showPrices = useShowPrices();
  const [inviting, setInviting] = useState(false);

  const isAdmin = currentUser.role === "admin";
  const items = activeItems(state);

  return (
    <>
      <PageHeader
        title={t("members.title")}
        subtitle={t("members.subtitle", { n: state.users.filter((u) => u.isActive).length })}
        action={
          isAdmin ? (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <MailPlus className="size-4" />
              {t("members.invite")}
            </Button>
          ) : null
        }
      />

      {/*
        Self-signup is disabled by design — without this, anyone with the URL
        could create an account in the family vault.
      */}
      <Card className="mb-4 bg-surface-2">
        <div className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" />
          <p className="text-sm text-muted">{t("members.inviteOnly")}</p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {state.users.map((user) => {
          const owned = items.filter((i) => i.ownerId === user.id);
          const holding = items.filter((i) => i.currentHolderId === user.id);
          const ownedValue = owned.reduce((s, i) => s + estimateValue(i, state.settings), 0);

          return (
            <Card key={user.id} className={user.isActive ? undefined : "opacity-60"}>
              <div className="flex items-start gap-3 p-4">
                <Avatar initials={user.initials} className="size-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{user.displayName}</p>
                    <Badge
                      tone={
                        user.role === "admin"
                          ? "bg-gold/10 text-gold-deep border-gold/30"
                          : undefined
                      }
                    >
                      {t(user.role === "admin" ? "members.roleAdmin" : "members.roleMember")}
                    </Badge>
                    {user.id === currentUser.id ? <Badge>{t("common.you")}</Badge> : null}
                    {!user.isActive ? (
                      <Badge tone="bg-danger/10 text-danger border-danger/30">
                        {t("members.inactive")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
                </div>
              </div>

              <div
                className={cn(
                  "grid gap-2 border-t border-border px-4 py-3 text-center",
                  showPrices ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                <div>
                  <p className="tabular text-lg font-semibold">{owned.length}</p>
                  <p className="text-xs text-muted">{t("members.owns")}</p>
                </div>
                <div>
                  <p className="tabular text-lg font-semibold">{holding.length}</p>
                  <p className="text-xs text-muted">{t("members.holding")}</p>
                </div>
                {showPrices ? (
                  <div>
                    <p className="tabular text-lg font-semibold">{formatMoneyShort(ownedValue)}</p>
                    <p className="text-xs text-muted">{t("members.ownedValue")}</p>
                  </div>
                ) : null}
              </div>

              {holding.length > 0 ? (
                <div className="border-t border-border px-4 py-3">
                  <p className="mb-1.5 text-xs font-medium text-muted">
                    {t("members.currentlyHolding")}
                  </p>
                  <ul className="space-y-1">
                    {holding.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/jewelry/item/?id=${item.id}`}
                          className="text-sm text-gold hover:underline"
                        >
                          {item.name}
                        </Link>
                        <span className="text-xs text-muted">
                          {" "}
                          · {formatWeight(item.grossWeight)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {isAdmin && user.isActive && user.id !== currentUser.id ? (
                <div className="border-t border-border px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => deactivateMember(user.id)}
                    className="flex items-center gap-1.5 text-sm text-muted hover:text-danger"
                  >
                    <UserMinus className="size-4" />
                    {t("members.deactivate")}
                  </button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {inviting ? (
        <InviteModal
          onClose={() => setInviting(false)}
          onInvite={(name, email, role) => {
            inviteMember(name, email, role);
            setInviting(false);
          }}
        />
      ) : null}
    </>
  );
}

function InviteModal({
  onClose,
  onInvite,
}: {
  onClose: () => void;
  onInvite: (name: string, email: string, role: Role) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("members.inviteTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onInvite(name.trim(), email.trim(), role)}
          >
            {t("members.sendInvite")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("members.name")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("members.namePlaceholder")}
          />
        </Field>
        <Field label={t("members.email")} required hint={t("members.emailHint")}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
          />
        </Field>
        <Field label={t("members.role")} hint={t("members.roleHint")}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">{t("members.roleMember")}</option>
            <option value="admin">{t("members.roleAdmin")}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
