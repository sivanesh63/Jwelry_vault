"use client";

import { useState } from "react";
import Link from "next/link";
import { MailPlus, ShieldCheck, UserMinus } from "lucide-react";
import { activeItems, useVault } from "@/lib/store";
import { estimateValue, formatMoneyShort, formatWeight } from "@/lib/format";
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
import type { Role } from "@/lib/types";

export default function MembersPage() {
  const { state, currentUser, inviteMember, deactivateMember } = useVault();
  const [inviting, setInviting] = useState(false);

  const isAdmin = currentUser.role === "admin";
  const items = activeItems(state);

  return (
    <>
      <PageHeader
        title="Family members"
        subtitle={`${state.users.filter((u) => u.isActive).length} active`}
        action={
          isAdmin ? (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <MailPlus className="size-4" />
              Invite
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
          <p className="text-sm text-muted">
            This vault is invite-only. New members receive an email invitation and set their own
            password — there is no public sign-up page.
          </p>
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
                      {user.role}
                    </Badge>
                    {user.id === currentUser.id ? <Badge>you</Badge> : null}
                    {!user.isActive ? (
                      <Badge tone="bg-danger/10 text-danger border-danger/30">inactive</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 text-center">
                <div>
                  <p className="tabular text-lg font-semibold">{owned.length}</p>
                  <p className="text-xs text-muted">owns</p>
                </div>
                <div>
                  <p className="tabular text-lg font-semibold">{holding.length}</p>
                  <p className="text-xs text-muted">holding</p>
                </div>
                <div>
                  <p className="tabular text-lg font-semibold">{formatMoneyShort(ownedValue)}</p>
                  <p className="text-xs text-muted">owned value</p>
                </div>
              </div>

              {holding.length > 0 ? (
                <div className="border-t border-border px-4 py-3">
                  <p className="mb-1.5 text-xs font-medium text-muted">Currently holding</p>
                  <ul className="space-y-1">
                    {holding.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/jewelry/item/?id=${item.id}`}
                          className="text-sm text-gold hover:underline"
                        >
                          {item.name}
                        </Link>
                        <span className="text-xs text-muted"> · {formatWeight(item.grossWeight)}</span>
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
                    Deactivate
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a family member"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onInvite(name.trim(), email.trim(), role)}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya" />
        </Field>
        <Field label="Email" required hint="They receive a link to set their own password">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
          />
        </Field>
        <Field label="Role" hint="Admins can add items, configure lockers, and invite others">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
