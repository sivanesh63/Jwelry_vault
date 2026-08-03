"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useVault } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";

export default function AuditPage() {
  const { state, userById } = useVault();
  const [actor, setActor] = useState("all");

  const entries = state.audit
    .filter((a) => actor === "all" || a.actorId === actor)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of every change. Entries are never edited or removed."
      />

      <div className="mb-3">
        <Select value={actor} onChange={(e) => setActor(e.target.value)} className="sm:max-w-xs">
          <option value="all">Everyone</option>
          {state.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </Select>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No activity yet" icon={<ScrollText className="size-8" />} />
      ) : (
        <Card>
          <ol className="divide-y divide-border">
            {entries.map((entry) => {
              const user = userById(entry.actorId);
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar initials={user?.initials ?? "??"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{user?.displayName ?? "Unknown"}</span>{" "}
                      <span className="text-muted">{entry.action.toLowerCase()}</span>
                    </p>
                    <p className="mt-0.5 break-words text-sm text-muted">{entry.detail}</p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(entry.at)}</p>
                  </div>
                  <Badge>{entry.entityType}</Badge>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </>
  );
}
