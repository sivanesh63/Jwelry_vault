"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, MailPlus, ShieldCheck, UserMinus } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { useKeyVault, type PendingMember } from "@/lib/keyvault";
import { estimateValue, formatMoneyShort, formatWeight, initialsOf } from "@/lib/format";
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
  const { state, currentUser, deactivateMember, reload } = useVault();
  const { pendingAdmissions, admitMember, invite } = useKeyVault();
  const t = useT();
  const showPrices = useShowPrices();
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const isAdmin = currentUser.role === "admin";
  const items = activeItems(state);

  const loadPending = useCallback(() => {
    if (!isAdmin) return;
    void pendingAdmissions()
      .then(setPending)
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  }, [isAdmin, pendingAdmissions]);

  useEffect(loadPending, [loadPending]);

  async function admit(member: PendingMember) {
    setWorking(member.memberId);
    setProblem(null);
    try {
      await admitMember(member.memberId, member.publicKey);
      loadPending();
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(null);
    }
  }

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

      {problem ? (
        <Card className="mb-4 border-danger/40 bg-danger/5">
          <p role="alert" className="p-4 text-sm text-danger">
            {problem}
          </p>
        </Card>
      ) : null}

      {/*
        Admission is a separate act from invitation, and this is where it
        happens. Creating a login gives somebody a seat; wrapping the family key
        to their public key is what lets them read. The wrapping runs in this
        browser with this admin's own copy of the key — the server only ever
        moves a sealed envelope between two people.
      */}
      {pending.length > 0 ? (
        <Card className="mb-4 border-gold/40">
          <div className="border-b border-border p-4">
            <p className="font-medium">{t("members.pendingTitle")}</p>
            <p className="mt-0.5 text-sm text-muted">{t("members.pendingBody")}</p>
          </div>
          <ul>
            {pending.map((p) => (
              <li
                key={p.memberId}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <Avatar initials={initialsOf(p.displayName)} className="size-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.displayName}</span>
                  <span className="block truncate text-sm text-muted">{p.email}</span>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={working === p.memberId}
                  onClick={() => void admit(p)}
                >
                  {working === p.memberId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {t("members.admit")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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
          onInvite={async (name, email, role) => {
            await invite(email, name, role);
            setInviting(false);
            reload();
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
  onInvite: (name: string, email: string, role: Role) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  async function send() {
    setSending(true);
    setFailure(null);
    try {
      await onInvite(name.trim(), email.trim(), role);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

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
          <Button variant="primary" disabled={!valid || sending} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("members.sendInvite")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {failure ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {failure}
          </p>
        ) : null}
        {/*
          Said before they send, not after. An invited person seeing an empty
          vault and reporting the app as broken is the failure this whole flow
          exists to prevent, and the admin is the one who can prevent it.
        */}
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("members.inviteThenAdmit")}
        </p>
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
