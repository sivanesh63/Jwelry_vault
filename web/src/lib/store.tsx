"use client";

/**
 * The data layer, now talking to Postgres through an envelope.
 *
 * Still the only module that knows where data comes from — screens call
 * `useVault()` and the interface they see is unchanged from the fixture
 * version, which is what the original file was built to make possible.
 *
 *
 * READING
 *
 * Every table is fetched whole and decrypted in memory. That is not laziness:
 * the sensitive columns are ciphertext, so Postgres cannot filter, sort or
 * search on any of them. `where name like '%bangle%'` is not a query that can
 * exist here. At family scale — hundreds of items, not millions — pulling
 * everything once and working locally is both simpler and faster than the
 * round trips a server-side filter would need.
 *
 *
 * WRITING
 *
 * Seal, write, reload. The reload is deliberate. Custody changes run as RPCs
 * that enforce the state machine server-side and may legitimately refuse, so
 * the only honest source of truth after a mutation is what the database
 * actually did — a local optimistic edit would be a second implementation of
 * the same rules, free to drift from the first.
 *
 *
 * AAD
 *
 * Every envelope is bound to its row id (see `aadFor`), so ids are generated
 * here before the write rather than defaulted by Postgres. An envelope moved to
 * another row fails to open instead of silently describing the wrong necklace.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { aadFor, open, seal, type VaultKey } from "./crypto";
import { useKeyVault } from "./keyvault";
import { decodeBytea, describeConnectionFailure, getSupabase, rpc, toPg } from "./supabase";
import { addDays, daysBetween, today } from "./format";
import type {
  AuditEntry,
  FamilyEvent,
  ItemStatus,
  JewelryItem,
  Locker,
  Movement,
  Settings,
  User,
  VaultDocument,
  VaultState,
} from "./types";

// ---- envelope payloads ------------------------------------------------------
// One per encrypted column. These mirror the comments in 0006_encryption.sql;
// if they drift, decryption still succeeds and fields quietly become undefined,
// so they are worth reading side by side when either changes.

type FamilyEnc = { name?: string };
type LockerEnc = { name?: string; branch?: string; lockerNumber?: string };
type EventEnc = { name?: string; location?: string; notes?: string };
type DocumentEnc = { fileName?: string };
type MovementEnc = { reason?: string; jeweler?: string };
type JewelryEnc = Partial<
  Pick<
    JewelryItem,
    | "name" | "category" | "customCategory" | "photos" | "photoSizes" | "grossWeight"
    | "netGoldWeight" | "stoneWeight" | "purity" | "hallmarkNo" | "purchaseDate"
    | "purchasePrice" | "jeweler" | "notes"
  >
>;

const EMPTY_SETTINGS: Settings = {
  familyId: "",
  familyName: "",
  goldRatePerGram24k: 0,
  goldRateUpdatedOn: "",
  currency: "INR",
  dueSoonLeadDays: 3,
  eventReminderLeadDays: 3,
  showPrices: false,
};

const EMPTY_STATE: VaultState = {
  users: [],
  lockers: [],
  jewelry: [],
  movements: [],
  events: [],
  documents: [],
  audit: [],
  notifications: [],
  settings: EMPTY_SETTINGS,
  currentUserId: "",
};

/**
 * Stands in for the signed-in member until the first load finishes.
 *
 * `currentUser` is non-optional in the interface because every screen leans on
 * it, and threading `| undefined` through twenty files to cover a few hundred
 * milliseconds would cost more than it protects. Nothing is rendered from it
 * before `hydrated` is true.
 */
const PLACEHOLDER_USER: User = {
  id: "",
  familyId: "",
  displayName: "",
  email: "",
  role: "member",
  isActive: true,
  initials: "",
};

interface VaultContextValue {
  state: VaultState;
  /** False until the first decrypt pass completes. */
  hydrated: boolean;
  /** The last write or read failure, in words meant for a person. */
  error: string | null;
  /** True while a mutation is in flight. */
  busy: boolean;

  currentUser: User;
  userById: (id?: string) => User | undefined;
  lockerById: (id?: string) => Locker | undefined;
  itemById: (id?: string) => JewelryItem | undefined;
  eventById: (id?: string) => FamilyEvent | undefined;
  locationOf: (item: JewelryItem) => string | undefined;
  openMovementOf: (jewelryId: string) => Movement | undefined;
  movementsOf: (jewelryId: string) => Movement[];
  documentsOf: (jewelryId: string) => VaultDocument[];

  takeOut: (args: {
    jewelryIds: string[];
    holderId: string;
    reason: string;
    expectedReturnOn: string;
    eventId?: string;
  }) => void;
  returnItems: (jewelryIds: string[], toLockerId: string) => void;
  extendReturn: (jewelryId: string, newDate: string) => void;
  startTransfer: (jewelryIds: string[], toLockerId: string, reason: string) => void;
  confirmArrival: (jewelryIds: string[]) => void;
  sendToJeweler: (jewelryId: string, jeweler: string, reason: string, expectedReturnOn: string) => void;
  collectFromJeweler: (jewelryId: string, toLockerId: string) => void;
  markLost: (jewelryId: string, reason: string) => void;
  saveItem: (item: JewelryItem) => void;
  archiveItem: (jewelryId: string) => void;
  saveLocker: (locker: Locker) => void;
  recordLockerVisit: (lockerId: string) => void;
  saveEvent: (event: FamilyEvent) => void;
  // No inviteMember here on purpose: creating a login needs the service_role
  // key, so it lives on useKeyVault and runs in an Edge Function. Nothing about
  // it is an encrypted record, which is all this store deals in.
  deactivateMember: (userId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  reload: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/** Two initials from a display name, matching `initials_of` in 0005_auth.sql. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

type Row = Record<string, unknown>;

/** Decrypts a row's envelope, treating a null column as an empty record. */
async function envelope<T>(key: VaultKey, table: string, row: Row): Promise<T> {
  const bytes = decodeBytea(row.enc);
  const value = await open<T>(key, bytes, aadFor(table, row.id as string));
  return (value ?? {}) as T;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const { key, memberId, familyId } = useKeyVault();
  const [state, setState] = useState<VaultState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- read ----------------------------------------------------------------

  const load = useCallback(async () => {
    if (!key || !familyId || !memberId) return;
    const supabase = getSupabase();

    const [
      families, members, lockers, jewelry, movements, events, eventItems,
      documents, audit, notifications,
    ] = await Promise.all([
      supabase.from("families").select("*").eq("id", familyId).single(),
      supabase.from("members").select("*").order("created_at"),
      supabase.from("lockers").select("*").order("created_at"),
      supabase.from("jewelry").select("*").order("created_at", { ascending: false }),
      supabase.from("movements").select("*").order("taken_at", { ascending: false }),
      supabase.from("events").select("*").order("starts_on", { ascending: false }),
      supabase.from("event_items").select("*"),
      supabase.from("documents").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("at", { ascending: false }).limit(200),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
    ]);

    for (const r of [families, members, lockers, jewelry, movements, events, eventItems, documents, audit, notifications]) {
      if (r.error) throw new Error(r.error.message);
    }

    const familyRow = families.data as Row;
    const familyEnc = await envelope<FamilyEnc>(key, "families", familyRow);

    const users: User[] = ((members.data ?? []) as Row[]).map((m) => ({
      id: m.id as string,
      familyId: m.family_id as string,
      displayName: m.display_name as string,
      email: m.email as string,
      role: m.role as User["role"],
      isActive: m.is_active as boolean,
      initials: (m.initials as string) || initialsOf(m.display_name as string),
    }));

    const lockerRows = (lockers.data ?? []) as Row[];
    const decryptedLockers: Locker[] = await Promise.all(
      lockerRows.map(async (l) => {
        const e = await envelope<LockerEnc>(key, "lockers", l);
        return {
          id: l.id as string,
          familyId: l.family_id as string,
          name: e.name ?? "",
          type: l.type as Locker["type"],
          branch: e.branch,
          lockerNumber: e.lockerNumber,
          keyHolderId: (l.key_holder_id as string) ?? undefined,
          visitIntervalDays: (l.visit_interval_days as number) ?? undefined,
          lastVisitedOn: (l.last_visited_on as string) ?? undefined,
        };
      }),
    );

    const decryptedJewelry: JewelryItem[] = await Promise.all(
      ((jewelry.data ?? []) as Row[]).map(async (j) => {
        const e = await envelope<JewelryEnc>(key, "jewelry", j);
        return {
          id: j.id as string,
          familyId: j.family_id as string,
          name: e.name ?? "",
          category: e.category ?? "other",
          customCategory: e.customCategory,
          photos: e.photos ?? [],
          photoSizes: e.photoSizes,
          grossWeight: e.grossWeight ?? 0,
          netGoldWeight: e.netGoldWeight ?? 0,
          stoneWeight: e.stoneWeight ?? 0,
          purity: e.purity ?? 22,
          hallmarkNo: e.hallmarkNo,
          purchaseDate: e.purchaseDate,
          purchasePrice: e.purchasePrice,
          jeweler: e.jeweler,
          notes: e.notes,
          status: j.status as JewelryItem["status"],
          ownerId: (j.owner_id as string) ?? "",
          currentHolderId: (j.current_holder_id as string) ?? undefined,
          currentLockerId: (j.current_locker_id as string) ?? undefined,
          expectedReturnOn: (j.expected_return_on as string) ?? undefined,
          isArchived: j.is_archived as boolean,
          createdAt: j.created_at as string,
        };
      }),
    );

    const decryptedMovements: Movement[] = await Promise.all(
      ((movements.data ?? []) as Row[]).map(async (m) => {
        const e = await envelope<MovementEnc>(key, "movements", m);
        const fromLocker = decryptedLockers.find((l) => l.id === m.from_locker_id);
        const toLocker = decryptedLockers.find((l) => l.id === m.to_locker_id);
        const holder = users.find((u) => u.id === m.holder_id);
        return {
          id: m.id as string,
          familyId: m.family_id as string,
          jewelryId: m.jewelry_id as string,
          type: m.type as Movement["type"],
          // The columns that used to hold these names are gone; the names come
          // back by joining ids to rows this client has already decrypted.
          fromLocation: fromLocker?.name ?? "—",
          toLocation: toLocker?.name ?? holder?.displayName ?? e.jeweler ?? "—",
          actorId: (m.actor_id as string) ?? "",
          holderId: (m.holder_id as string) ?? undefined,
          reason: e.reason,
          takenAt: m.taken_at as string,
          expectedReturnOn: (m.expected_return_on as string) ?? undefined,
          returnedAt: (m.returned_at as string) ?? undefined,
          eventId: (m.event_id as string) ?? undefined,
        };
      }),
    );

    const itemsByEvent = new Map<string, string[]>();
    for (const link of (eventItems.data ?? []) as Row[]) {
      const list = itemsByEvent.get(link.event_id as string) ?? [];
      list.push(link.jewelry_id as string);
      itemsByEvent.set(link.event_id as string, list);
    }

    const decryptedEvents: FamilyEvent[] = await Promise.all(
      ((events.data ?? []) as Row[]).map(async (ev) => {
        const e = await envelope<EventEnc>(key, "events", ev);
        return {
          id: ev.id as string,
          familyId: ev.family_id as string,
          name: e.name ?? "",
          startsOn: ev.starts_on as string,
          endsOn: ev.ends_on as string,
          location: e.location,
          notes: e.notes,
          jewelryIds: itemsByEvent.get(ev.id as string) ?? [],
        };
      }),
    );

    const decryptedDocuments: VaultDocument[] = await Promise.all(
      ((documents.data ?? []) as Row[]).map(async (d) => {
        const e = await envelope<DocumentEnc>(key, "documents", d);
        return {
          id: d.id as string,
          familyId: d.family_id as string,
          jewelryId: d.jewelry_id as string,
          type: d.type as VaultDocument["type"],
          fileName: e.fileName ?? "",
          uploadedAt: d.uploaded_at as string,
          expiresOn: (d.expires_on as string) ?? undefined,
        };
      }),
    );

    // Audit rows carry ids and counts, never words — see 0006. The sentence is
    // assembled here, from names this client has already decrypted, which is
    // also why the server can write the log without being able to read it.
    const nameOf = (id?: string) => decryptedJewelry.find((j) => j.id === id)?.name;
    const auditEntries: AuditEntry[] = ((audit.data ?? []) as Row[]).map((a) => {
      const p = (a.params ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof p.count === "number") parts.push(`${p.count} ×`);
      const single = nameOf(p.itemId as string | undefined);
      if (single) parts.push(single);
      const holder = users.find((u) => u.id === p.holderId)?.displayName;
      const locker = decryptedLockers.find((l) => l.id === p.lockerId)?.name;
      if (holder ?? locker) parts.push(`→ ${holder ?? locker}`);
      if (p.from != null || p.to != null) parts.push(`${p.from ?? "—"} → ${p.to ?? "—"}`);
      return {
        id: a.id as string,
        familyId: a.family_id as string,
        actorId: (a.actor_id as string) ?? "",
        actionKey: a.action_key as string,
        entityType: a.entity_type as AuditEntry["entityType"],
        entityId: (a.entity_id as string) ?? "",
        detail: parts.join(" "),
        at: a.at as string,
      };
    });

    setState({
      users,
      lockers: decryptedLockers,
      jewelry: decryptedJewelry,
      movements: decryptedMovements,
      events: decryptedEvents,
      documents: decryptedDocuments,
      audit: auditEntries,
      notifications: ((notifications.data ?? []) as Row[]).map((n) => ({
        id: n.id as string,
        familyId: n.family_id as string,
        kind: n.kind as VaultState["notifications"][number]["kind"],
        params: (n.params ?? {}) as Record<string, string | number>,
        jewelryId: (n.jewelry_id as string) ?? undefined,
        eventId: (n.event_id as string) ?? undefined,
        createdAt: n.created_at as string,
        readAt: (n.read_at as string) ?? undefined,
      })),
      settings: {
        familyId,
        familyName: familyEnc.name ?? "",
        goldRatePerGram24k: Number(familyRow.gold_rate_per_gram_24k ?? 0),
        goldRateUpdatedOn: (familyRow.gold_rate_updated_on as string) ?? "",
        currency: (familyRow.currency as string) ?? "INR",
        dueSoonLeadDays: Number(familyRow.due_soon_lead_days ?? 3),
        eventReminderLeadDays: Number(familyRow.event_reminder_lead_days ?? 3),
        showPrices: Boolean(familyRow.show_prices),
      },
      currentUserId: memberId,
    });
    setHydrated(true);
  }, [key, familyId, memberId]);

  const reload = useCallback(() => {
    void load().catch((e) => setError(describeConnectionFailure(e)));
  }, [load]);

  useEffect(() => {
    // Fetching and decrypting cannot happen during render. The rule this
    // suppresses is about setState called *synchronously* in an effect body;
    // load() is async, so every setState inside it lands in a later task. An
    // external system read on mount is the case effects exist for.
    //
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((e) => setError(describeConnectionFailure(e)));
  }, [load]);

  /**
   * Runs a mutation, then reloads.
   *
   * Errors are held rather than thrown: the interface these back is
   * fire-and-forget, so a rejected promise would surface as an unhandled
   * rejection in the console and nothing at all on screen.
   */
  const mutate = useCallback(
    (action: (key: VaultKey) => Promise<void>) => {
      if (!key) {
        setError("The vault is locked.");
        return;
      }
      setBusy(true);
      setError(null);
      void action(key)
        .then(() => load())
        .catch((e) => setError(describeConnectionFailure(e)))
        .finally(() => setBusy(false));
    },
    [key, load],
  );

  // ---- lookups -------------------------------------------------------------

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? PLACEHOLDER_USER,
    [state.users, state.currentUserId],
  );

  const userById = useCallback((id?: string) => state.users.find((u) => u.id === id), [state.users]);
  const lockerById = useCallback((id?: string) => state.lockers.find((l) => l.id === id), [state.lockers]);
  const itemById = useCallback((id?: string) => state.jewelry.find((j) => j.id === id), [state.jewelry]);
  const eventById = useCallback((id?: string) => state.events.find((e) => e.id === id), [state.events]);

  const locationOf = useCallback(
    (item: JewelryItem): string | undefined => {
      switch (item.status) {
        case "in_locker":
          return lockerById(item.currentLockerId)?.name;
        case "with_member":
          return userById(item.currentHolderId)?.displayName;
        case "at_jeweler":
          return item.jeweler;
        default:
          return undefined;
      }
    },
    [lockerById, userById],
  );

  const openMovementOf = useCallback(
    (jewelryId: string) => state.movements.find((m) => m.jewelryId === jewelryId && !m.returnedAt),
    [state.movements],
  );

  const movementsOf = useCallback(
    (jewelryId: string) =>
      state.movements
        .filter((m) => m.jewelryId === jewelryId)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    [state.movements],
  );

  const documentsOf = useCallback(
    (jewelryId: string) => state.documents.filter((d) => d.jewelryId === jewelryId),
    [state.documents],
  );

  // ---- custody, through the state machine ----------------------------------
  // None of these edit rows directly. The RPCs in 0003/0006 own the transitions
  // and will refuse an illegal one, which is the point of them being RPCs.

  const takeOut = useCallback<VaultContextValue["takeOut"]>(
    ({ jewelryIds, holderId, reason, expectedReturnOn, eventId }) => {
      mutate(async (k) => {
        await rpc("take_out", {
          p_jewelry_ids: jewelryIds,
          p_holder_id: holderId,
          p_enc: toPg(await seal(k, { reason }, aadFor("movements", jewelryIds[0]))),
          p_expected_return: expectedReturnOn || null,
          p_event_id: eventId ?? null,
        });
      });
    },
    [mutate],
  );

  const returnItems = useCallback<VaultContextValue["returnItems"]>(
    (jewelryIds, toLockerId) => {
      mutate(async () => {
        await rpc("return_items", { p_jewelry_ids: jewelryIds, p_to_locker_id: toLockerId });
      });
    },
    [mutate],
  );

  const extendReturn = useCallback<VaultContextValue["extendReturn"]>(
    (jewelryId, newDate) => {
      mutate(async () => {
        await rpc("extend_return", { p_jewelry_id: jewelryId, p_new_date: newDate });
      });
    },
    [mutate],
  );

  const startTransfer = useCallback<VaultContextValue["startTransfer"]>(
    (jewelryIds, toLockerId, reason) => {
      mutate(async (k) => {
        await rpc("start_transfer", {
          p_jewelry_ids: jewelryIds,
          p_to_locker_id: toLockerId,
          p_enc: toPg(await seal(k, { reason }, aadFor("movements", jewelryIds[0]))),
        });
      });
    },
    [mutate],
  );

  const confirmArrival = useCallback<VaultContextValue["confirmArrival"]>(
    (jewelryIds) => {
      mutate(async () => {
        await rpc("confirm_arrival", { p_jewelry_ids: jewelryIds });
      });
    },
    [mutate],
  );

  const sendToJeweler = useCallback<VaultContextValue["sendToJeweler"]>(
    (jewelryId, jeweler, reason, expectedReturnOn) => {
      mutate(async (k) => {
        await rpc("send_to_jeweler", {
          p_jewelry_id: jewelryId,
          p_enc: toPg(await seal(k, { jeweler, reason }, aadFor("movements", jewelryId))),
          p_expected_return: expectedReturnOn || null,
        });
        // The jeweler's name also belongs on the item, so the detail screen can
        // say where it is without walking the movement history.
        await patchJewelryEnvelope(k, jewelryId, { jeweler });
      });
    },
    [mutate],
  );

  const collectFromJeweler = useCallback<VaultContextValue["collectFromJeweler"]>(
    (jewelryId, toLockerId) => {
      mutate(async () => {
        await rpc("collect_from_jeweler", {
          p_jewelry_id: jewelryId,
          p_to_locker_id: toLockerId,
        });
      });
    },
    [mutate],
  );

  const markLost = useCallback<VaultContextValue["markLost"]>(
    (jewelryId, reason) => {
      mutate(async (k) => {
        await rpc("mark_lost", {
          p_jewelry_id: jewelryId,
          p_enc: toPg(await seal(k, { reason }, aadFor("movements", jewelryId))),
        });
      });
    },
    [mutate],
  );

  // ---- records -------------------------------------------------------------

  const saveItem = useCallback<VaultContextValue["saveItem"]>(
    (item) => {
      mutate(async (k) => {
        const enc = await seal(
          k,
          {
            name: item.name,
            category: item.category,
            customCategory: item.customCategory,
            photos: item.photos,
            photoSizes: item.photoSizes,
            grossWeight: item.grossWeight,
            netGoldWeight: item.netGoldWeight,
            stoneWeight: item.stoneWeight,
            purity: item.purity,
            hallmarkNo: item.hallmarkNo,
            purchaseDate: item.purchaseDate,
            purchasePrice: item.purchasePrice,
            jeweler: item.jeweler,
            notes: item.notes,
          } satisfies JewelryEnc,
          aadFor("jewelry", item.id),
        );

        const { error: e } = await getSupabase().from("jewelry").upsert({
          id: item.id,
          family_id: familyId,
          enc: toPg(enc),
          status: item.status,
          owner_id: item.ownerId || null,
          current_holder_id: item.currentHolderId ?? null,
          current_locker_id: item.currentLockerId ?? null,
          expected_return_on: item.expectedReturnOn ?? null,
          is_archived: item.isArchived,
        });
        if (e) throw new Error(e.message);
      });
    },
    [familyId, mutate],
  );

  const archiveItem = useCallback<VaultContextValue["archiveItem"]>(
    (jewelryId) => {
      mutate(async () => {
        // Archive, never delete: movement history must not be orphaned, which
        // is also why 0002 grants no delete policy on this table.
        const { error: e } = await getSupabase()
          .from("jewelry")
          .update({ is_archived: true })
          .eq("id", jewelryId);
        if (e) throw new Error(e.message);
      });
    },
    [mutate],
  );

  const saveLocker = useCallback<VaultContextValue["saveLocker"]>(
    (locker) => {
      mutate(async (k) => {
        const enc = await seal(
          k,
          { name: locker.name, branch: locker.branch, lockerNumber: locker.lockerNumber } satisfies LockerEnc,
          aadFor("lockers", locker.id),
        );
        const { error: e } = await getSupabase().from("lockers").upsert({
          id: locker.id,
          family_id: familyId,
          enc: toPg(enc),
          type: locker.type,
          key_holder_id: locker.keyHolderId ?? null,
          visit_interval_days: locker.visitIntervalDays ?? null,
          last_visited_on: locker.lastVisitedOn ?? null,
        });
        if (e) throw new Error(e.message);
      });
    },
    [familyId, mutate],
  );

  const recordLockerVisit = useCallback<VaultContextValue["recordLockerVisit"]>(
    (lockerId) => {
      mutate(async () => {
        await rpc("record_locker_visit", { p_locker_id: lockerId, p_enc: null });
      });
    },
    [mutate],
  );

  const saveEvent = useCallback<VaultContextValue["saveEvent"]>(
    (event) => {
      mutate(async (k) => {
        const supabase = getSupabase();
        const enc = await seal(
          k,
          { name: event.name, location: event.location, notes: event.notes } satisfies EventEnc,
          aadFor("events", event.id),
        );
        const { error: e } = await supabase.from("events").upsert({
          id: event.id,
          family_id: familyId,
          enc: toPg(enc),
          starts_on: event.startsOn,
          ends_on: event.endsOn,
        });
        if (e) throw new Error(e.message);

        // Replace the attachments wholesale. The join carries no data of its
        // own, so a diff would be more code for an identical result.
        const { error: delError } = await supabase
          .from("event_items")
          .delete()
          .eq("event_id", event.id);
        if (delError) throw new Error(delError.message);

        if (event.jewelryIds.length > 0) {
          const { error: insError } = await supabase.from("event_items").insert(
            event.jewelryIds.map((jewelryId) => ({ event_id: event.id, jewelry_id: jewelryId })),
          );
          if (insError) throw new Error(insError.message);
        }
      });
    },
    [familyId, mutate],
  );

  // ---- people --------------------------------------------------------------

  // Inviting lives on `useKeyVault`, not here. It needs the service_role key,
  // so it runs in the invite-member Edge Function rather than the browser —
  // there is no encrypted record for this store to write.

  const deactivateMember = useCallback<VaultContextValue["deactivateMember"]>(
    (userId) => {
      mutate(async () => {
        const { error: e } = await getSupabase()
          .from("members")
          .update({ is_active: false })
          .eq("id", userId);
        if (e) throw new Error(e.message);
      });
    },
    [mutate],
  );

  // ---- settings ------------------------------------------------------------

  const updateSettings = useCallback<VaultContextValue["updateSettings"]>(
    (patch) => {
      mutate(async (k) => {
        // The rate goes through its own RPC because changing it also snapshots
        // it into `valuations`, so past valuations stay answerable.
        if (patch.goldRatePerGram24k != null) {
          await rpc("set_gold_rate", { p_rate: patch.goldRatePerGram24k });
        }

        const row: Row = {};
        if (patch.currency != null) row.currency = patch.currency;
        if (patch.dueSoonLeadDays != null) row.due_soon_lead_days = patch.dueSoonLeadDays;
        if (patch.eventReminderLeadDays != null) row.event_reminder_lead_days = patch.eventReminderLeadDays;
        if (patch.showPrices != null) row.show_prices = patch.showPrices;
        if (patch.familyName != null) {
          row.enc = toPg(await seal(k, { name: patch.familyName } satisfies FamilyEnc, aadFor("families", familyId!)));
        }

        if (Object.keys(row).length > 0) {
          const { error: e } = await getSupabase().from("families").update(row).eq("id", familyId!);
          if (e) throw new Error(e.message);
        }
      });
    },
    [familyId, mutate],
  );

  // ---- notifications -------------------------------------------------------

  const markNotificationRead = useCallback<VaultContextValue["markNotificationRead"]>(
    (id) => {
      mutate(async () => {
        const { error: e } = await getSupabase()
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", id);
        if (e) throw new Error(e.message);
      });
    },
    [mutate],
  );

  const markAllNotificationsRead = useCallback(() => {
    mutate(async () => {
      const { error: e } = await getSupabase()
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (e) throw new Error(e.message);
    });
  }, [mutate]);

  const value: VaultContextValue = {
    state,
    hydrated,
    error,
    busy,
    currentUser,
    userById,
    lockerById,
    itemById,
    eventById,
    locationOf,
    openMovementOf,
    movementsOf,
    documentsOf,
    takeOut,
    returnItems,
    extendReturn,
    startTransfer,
    confirmArrival,
    sendToJeweler,
    collectFromJeweler,
    markLost,
    saveItem,
    archiveItem,
    saveLocker,
    recordLockerVisit,
    saveEvent,
    deactivateMember,
    updateSettings,
    markNotificationRead,
    markAllNotificationsRead,
    reload,
  };

  return (
    <VaultContext.Provider value={value}>
      {children}
      {error ? (
        <div
          role="alert"
          // The bottom nav carries pb-[env(safe-area-inset-bottom)], so on a
          // notched iPhone it is taller than the 5rem this used to clear — the
          // banner sat behind it, which is a poor place for the only thing that
          // reports a failed save.
          className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-md"
        >
          <div className="flex items-start gap-3">
            <span className="flex-1">{error}</span>
            <button type="button" className="shrink-0 underline" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        </div>
      ) : null}
    </VaultContext.Provider>
  );
}

/**
 * Rewrites one part of an item's envelope without disturbing the rest.
 *
 * Needed because an envelope is all-or-nothing: to change the jeweler you must
 * decrypt the whole record, edit it, and seal it again. Reading the row back
 * first rather than trusting local state keeps a concurrent edit from being
 * silently reverted.
 */
async function patchJewelryEnvelope(
  key: VaultKey,
  jewelryId: string,
  patch: JewelryEnc,
): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("jewelry").select("id, enc").eq("id", jewelryId).single();
  if (error) throw new Error(error.message);
  const current = await envelope<JewelryEnc>(key, "jewelry", data as Row);
  const enc = await seal(key, { ...current, ...patch }, aadFor("jewelry", jewelryId));
  const { error: e } = await supabase.from("jewelry").update({ enc: toPg(enc) }).eq("id", jewelryId);
  if (e) throw new Error(e.message);
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}

// ---- Derived helpers -------------------------------------------------------
//
// Unchanged from the fixture version, and they work untouched because they take
// a decrypted VaultState. Every filter here reads a field that is ciphertext in
// Postgres, which is the concrete reason the whole table is fetched and opened
// rather than queried — none of these could be a WHERE clause.

/** Items that are out and past their expected return date. */
export function overdueItems(state: VaultState): JewelryItem[] {
  const t = today();
  return state.jewelry.filter(
    (j) =>
      !j.isArchived &&
      j.expectedReturnOn != null &&
      (j.status === "with_member" || j.status === "at_jeweler") &&
      daysBetween(j.expectedReturnOn, t) > 0,
  );
}

/** Items due back within the configured lead time, not yet overdue. */
export function dueSoonItems(state: VaultState): JewelryItem[] {
  const t = today();
  return state.jewelry.filter((j) => {
    if (j.isArchived || !j.expectedReturnOn) return false;
    if (j.status !== "with_member" && j.status !== "at_jeweler") return false;
    const delta = daysBetween(t, j.expectedReturnOn);
    return delta >= 0 && delta <= state.settings.dueSoonLeadDays;
  });
}

export function activeItems(state: VaultState): JewelryItem[] {
  return state.jewelry.filter((j) => !j.isArchived);
}

/** Lockers whose visit interval has elapsed. */
export function lockersNeedingVisit(state: VaultState): Locker[] {
  const t = today();
  return state.lockers.filter((l) => {
    if (!l.visitIntervalDays || !l.lastVisitedOn) return false;
    return daysBetween(l.lastVisitedOn, t) >= l.visitIntervalDays;
  });
}

/** Events starting within the configured lead time. */
export function upcomingEvents(state: VaultState): FamilyEvent[] {
  const t = today();
  return state.events
    .filter((e) => {
      const delta = daysBetween(t, e.startsOn);
      return delta >= 0 && delta <= 30;
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** Active items with no invoice on file. */
export function itemsMissingDocuments(state: VaultState): JewelryItem[] {
  return activeItems(state).filter(
    (j) => !state.documents.some((d) => d.jewelryId === j.id && d.type === "invoice"),
  );
}

export function suggestedReturnDate(eventEndsOn?: string): string {
  return eventEndsOn ? addDays(eventEndsOn, 1) : addDays(today(), 7);
}

export const STATUS_ORDER: ItemStatus[] = [
  "in_locker",
  "with_member",
  "in_transit",
  "at_jeweler",
  "lost",
];
