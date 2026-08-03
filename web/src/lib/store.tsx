"use client";

/**
 * The prototype's data layer.
 *
 * This is deliberately the ONLY module that knows where data comes from.
 * Screens call `useVault()` and never touch storage directly, so replacing this
 * with Supabase queries is a swap of this one file rather than a rewrite of the
 * UI. Mutations mirror the transitions allowed by the item state machine and
 * each one writes an audit entry, exactly as the Postgres version will.
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
import { seedState } from "./fixtures";
import { addDays, daysBetween, today } from "./format";
import { newId } from "./utils";
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

const STORAGE_KEY = "jv:state:v1";

function nowIso(): string {
  return new Date().toISOString();
}

interface VaultContextValue {
  state: VaultState;
  /** False during the first render pass, before localStorage is read. */
  hydrated: boolean;

  // Lookups
  currentUser: User;
  userById: (id?: string) => User | undefined;
  lockerById: (id?: string) => Locker | undefined;
  itemById: (id?: string) => JewelryItem | undefined;
  eventById: (id?: string) => FamilyEvent | undefined;
  /** Locker name, holder name or jeweler; undefined when in transit or lost. */
  locationOf: (item: JewelryItem) => string | undefined;
  /** Open (unreturned) movement for an item, if any. */
  openMovementOf: (jewelryId: string) => Movement | undefined;
  movementsOf: (jewelryId: string) => Movement[];
  documentsOf: (jewelryId: string) => VaultDocument[];

  // Mutations
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
  inviteMember: (displayName: string, email: string, role: User["role"]) => void;
  deactivateMember: (userId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  switchUser: (userId: string) => void;
  resetDemo: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  // First render must be deterministic for the statically exported HTML to match,
  // so we always start from the seed and load persisted state after mount.
  const [state, setState] = useState<VaultState>(seedState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // Reading localStorage cannot happen during render: the statically exported
      // HTML is produced at build time with no storage available, so initialising
      // state from it directly would desync server and client markup. Adopting the
      // persisted state on mount is the intended pattern, and it runs exactly once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState(JSON.parse(raw) as VaultState);
    } catch {
      // Corrupt or unavailable storage: fall back to the seed rather than crash.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or private mode — the prototype still works in memory.
    }
  }, [state, hydrated]);

  /** Applies a state change and appends an audit entry in one update. */
  const commit = useCallback(
    (
      mutate: (draft: VaultState) => void,
      audit: Omit<AuditEntry, "id" | "familyId" | "actorId" | "at"> | null,
    ) => {
      setState((prev) => {
        const draft: VaultState = structuredClone(prev);
        mutate(draft);
        if (audit) {
          draft.audit.unshift({
            id: newId("a"),
            familyId: draft.settings.familyId,
            actorId: draft.currentUserId,
            at: nowIso(),
            ...audit,
          });
        }
        return draft;
      });
    },
    [],
  );

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? state.users[0],
    [state.users, state.currentUserId],
  );

  const userById = useCallback((id?: string) => state.users.find((u) => u.id === id), [state.users]);
  const lockerById = useCallback((id?: string) => state.lockers.find((l) => l.id === id), [state.lockers]);
  const itemById = useCallback((id?: string) => state.jewelry.find((j) => j.id === id), [state.jewelry]);
  const eventById = useCallback((id?: string) => state.events.find((e) => e.id === id), [state.events]);

  /**
   * Raw location name, or undefined when the position has no name of its own
   * (in transit, lost). Callers render the localised status label in that case —
   * see `useLocationLabel` in components/vault.tsx. Kept name-only here so the
   * data layer stays free of display language.
   */
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
    (jewelryId: string) =>
      state.movements.find((m) => m.jewelryId === jewelryId && !m.returnedAt),
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

  // ---- Mutations -----------------------------------------------------------

  const takeOut = useCallback<VaultContextValue["takeOut"]>(
    ({ jewelryIds, holderId, reason, expectedReturnOn, eventId }) => {
      commit(
        (draft) => {
          const holder = draft.users.find((u) => u.id === holderId);
          for (const id of jewelryIds) {
            const item = draft.jewelry.find((j) => j.id === id);
            // Guard: only items sitting in a locker can be taken out. This is the
            // client-side mirror of the unique-open-movement index in Postgres.
            if (!item || item.status !== "in_locker") continue;
            const from = draft.lockers.find((l) => l.id === item.currentLockerId)?.name ?? "—";

            draft.movements.unshift({
              id: newId("m"),
              familyId: draft.settings.familyId,
              jewelryId: id,
              type: "takeout",
              fromLocation: from,
              toLocation: holder?.displayName ?? "—",
              actorId: draft.currentUserId,
              holderId,
              reason,
              takenAt: nowIso(),
              expectedReturnOn,
              eventId,
            });

            item.status = "with_member";
            item.currentHolderId = holderId;
            item.currentLockerId = undefined;
            item.expectedReturnOn = expectedReturnOn;
          }
        },
        {
          actionKey: "audit.tookOut",
          entityType: "movement",
          entityId: jewelryIds.join(","),
          detail: `${jewelryIds.length} × → ${
            state.users.find((u) => u.id === holderId)?.displayName ?? "—"
          }${reason ? ` (${reason})` : ""}`,
        },
      );
    },
    [commit, state.users],
  );

  const returnItems = useCallback<VaultContextValue["returnItems"]>(
    (jewelryIds, toLockerId) => {
      commit(
        (draft) => {
          const locker = draft.lockers.find((l) => l.id === toLockerId);
          for (const id of jewelryIds) {
            const item = draft.jewelry.find((j) => j.id === id);
            if (!item || item.status !== "with_member") continue;
            const open = draft.movements.find((m) => m.jewelryId === id && !m.returnedAt);
            if (open) open.returnedAt = nowIso();

            item.status = "in_locker";
            item.currentLockerId = toLockerId;
            item.currentHolderId = undefined;
            item.expectedReturnOn = undefined;
          }
          if (locker) locker.lastVisitedOn = today();
        },
        {
          actionKey: "audit.returned",
          entityType: "movement",
          entityId: jewelryIds.join(","),
          detail: `${jewelryIds.length} × → ${
            state.lockers.find((l) => l.id === toLockerId)?.name ?? "—"
          }`,
        },
      );
    },
    [commit, state.lockers],
  );

  const extendReturn = useCallback<VaultContextValue["extendReturn"]>(
    (jewelryId, newDate) => {
      const item = state.jewelry.find((j) => j.id === jewelryId);
      commit(
        (draft) => {
          const target = draft.jewelry.find((j) => j.id === jewelryId);
          if (target) target.expectedReturnOn = newDate;
          const open = draft.movements.find((m) => m.jewelryId === jewelryId && !m.returnedAt);
          if (open) open.expectedReturnOn = newDate;
        },
        {
          // Logged separately so the original promise is never silently rewritten.
          actionKey: "audit.extendedDue",
          entityType: "movement",
          entityId: jewelryId,
          detail: `${item?.name ?? "—"} — ${item?.expectedReturnOn ?? "?"} → ${newDate}`,
        },
      );
    },
    [commit, state.jewelry],
  );

  const startTransfer = useCallback<VaultContextValue["startTransfer"]>(
    (jewelryIds, toLockerId, reason) => {
      commit(
        (draft) => {
          const to = draft.lockers.find((l) => l.id === toLockerId);
          for (const id of jewelryIds) {
            const item = draft.jewelry.find((j) => j.id === id);
            if (!item || item.status !== "in_locker") continue;
            const from = draft.lockers.find((l) => l.id === item.currentLockerId)?.name ?? "—";

            draft.movements.unshift({
              id: newId("m"),
              familyId: draft.settings.familyId,
              jewelryId: id,
              type: "transfer",
              fromLocation: from,
              toLocation: to?.name ?? "—",
              actorId: draft.currentUserId,
              reason,
              takenAt: nowIso(),
            });

            // in_transit exists so items are never invisible mid-move.
            item.status = "in_transit";
            item.currentLockerId = toLockerId;
          }
        },
        {
          actionKey: "audit.startedTransfer",
          entityType: "movement",
          entityId: jewelryIds.join(","),
          detail: `${jewelryIds.length} × → ${
            state.lockers.find((l) => l.id === toLockerId)?.name ?? "—"
          }`,
        },
      );
    },
    [commit, state.lockers],
  );

  const confirmArrival = useCallback<VaultContextValue["confirmArrival"]>(
    (jewelryIds) => {
      commit(
        (draft) => {
          for (const id of jewelryIds) {
            const item = draft.jewelry.find((j) => j.id === id);
            if (!item || item.status !== "in_transit") continue;
            const open = draft.movements.find((m) => m.jewelryId === id && !m.returnedAt);
            if (open) open.returnedAt = nowIso();
            item.status = "in_locker";
          }
        },
        {
          actionKey: "audit.confirmedArrival",
          entityType: "movement",
          entityId: jewelryIds.join(","),
          detail: `${jewelryIds.length} ×`,
        },
      );
    },
    [commit],
  );

  const sendToJeweler = useCallback<VaultContextValue["sendToJeweler"]>(
    (jewelryId, jeweler, reason, expectedReturnOn) => {
      commit(
        (draft) => {
          const item = draft.jewelry.find((j) => j.id === jewelryId);
          if (!item || item.status !== "in_locker") return;
          const from = draft.lockers.find((l) => l.id === item.currentLockerId)?.name ?? "—";

          draft.movements.unshift({
            id: newId("m"),
            familyId: draft.settings.familyId,
            jewelryId,
            type: "service",
            fromLocation: from,
            toLocation: jeweler,
            actorId: draft.currentUserId,
            reason,
            takenAt: nowIso(),
            expectedReturnOn,
          });

          item.status = "at_jeweler";
          item.currentLockerId = undefined;
          item.expectedReturnOn = expectedReturnOn;
          item.jeweler = jeweler;
        },
        {
          actionKey: "audit.sentForService",
          entityType: "jewelry",
          entityId: jewelryId,
          detail: `${state.jewelry.find((j) => j.id === jewelryId)?.name ?? "—"} → ${jeweler}`,
        },
      );
    },
    [commit, state.jewelry],
  );

  const collectFromJeweler = useCallback<VaultContextValue["collectFromJeweler"]>(
    (jewelryId, toLockerId) => {
      commit(
        (draft) => {
          const item = draft.jewelry.find((j) => j.id === jewelryId);
          if (!item || item.status !== "at_jeweler") return;
          const open = draft.movements.find((m) => m.jewelryId === jewelryId && !m.returnedAt);
          if (open) open.returnedAt = nowIso();
          item.status = "in_locker";
          item.currentLockerId = toLockerId;
          item.expectedReturnOn = undefined;
        },
        {
          actionKey: "audit.collectedFromJeweler",
          entityType: "jewelry",
          entityId: jewelryId,
          detail: state.jewelry.find((j) => j.id === jewelryId)?.name ?? "—",
        },
      );
    },
    [commit, state.jewelry],
  );

  const markLost = useCallback<VaultContextValue["markLost"]>(
    (jewelryId, reason) => {
      commit(
        (draft) => {
          const item = draft.jewelry.find((j) => j.id === jewelryId);
          if (!item) return;
          draft.movements.unshift({
            id: newId("m"),
            familyId: draft.settings.familyId,
            jewelryId,
            type: "lost",
            fromLocation: item.currentLockerId ?? item.currentHolderId ?? "—",
            toLocation: "Lost",
            actorId: draft.currentUserId,
            reason,
            takenAt: nowIso(),
          });
          item.status = "lost";
          item.currentLockerId = undefined;
          item.currentHolderId = undefined;
        },
        {
          actionKey: "audit.markedLost",
          entityType: "jewelry",
          entityId: jewelryId,
          detail: `${state.jewelry.find((j) => j.id === jewelryId)?.name ?? "—"} — ${reason}`,
        },
      );
    },
    [commit, state.jewelry],
  );

  const saveItem = useCallback<VaultContextValue["saveItem"]>(
    (item) => {
      const isNew = !state.jewelry.some((j) => j.id === item.id);
      commit(
        (draft) => {
          const idx = draft.jewelry.findIndex((j) => j.id === item.id);
          if (idx >= 0) draft.jewelry[idx] = item;
          else draft.jewelry.unshift(item);
        },
        {
          actionKey: isNew ? "audit.addedItem" : "audit.editedItem",
          entityType: "jewelry",
          entityId: item.id,
          detail: item.name,
        },
      );
    },
    [commit, state.jewelry],
  );

  const archiveItem = useCallback<VaultContextValue["archiveItem"]>(
    (jewelryId) => {
      commit(
        (draft) => {
          const item = draft.jewelry.find((j) => j.id === jewelryId);
          // Archive rather than delete: movement history must never be orphaned.
          if (item) item.isArchived = true;
        },
        {
          actionKey: "audit.archivedItem",
          entityType: "jewelry",
          entityId: jewelryId,
          detail: state.jewelry.find((j) => j.id === jewelryId)?.name ?? "—",
        },
      );
    },
    [commit, state.jewelry],
  );

  const saveLocker = useCallback<VaultContextValue["saveLocker"]>(
    (locker) => {
      const isNew = !state.lockers.some((l) => l.id === locker.id);
      commit(
        (draft) => {
          const idx = draft.lockers.findIndex((l) => l.id === locker.id);
          if (idx >= 0) draft.lockers[idx] = locker;
          else draft.lockers.push(locker);
        },
        {
          actionKey: isNew ? "audit.addedLocker" : "audit.editedLocker",
          entityType: "locker",
          entityId: locker.id,
          detail: locker.name,
        },
      );
    },
    [commit, state.lockers],
  );

  const recordLockerVisit = useCallback<VaultContextValue["recordLockerVisit"]>(
    (lockerId) => {
      commit(
        (draft) => {
          const locker = draft.lockers.find((l) => l.id === lockerId);
          if (locker) locker.lastVisitedOn = today();
        },
        {
          actionKey: "audit.verifiedLocker",
          entityType: "locker",
          entityId: lockerId,
          detail: state.lockers.find((l) => l.id === lockerId)?.name ?? "—",
        },
      );
    },
    [commit, state.lockers],
  );

  const saveEvent = useCallback<VaultContextValue["saveEvent"]>(
    (event) => {
      const isNew = !state.events.some((e) => e.id === event.id);
      commit(
        (draft) => {
          const idx = draft.events.findIndex((e) => e.id === event.id);
          if (idx >= 0) draft.events[idx] = event;
          else draft.events.unshift(event);
        },
        {
          actionKey: isNew ? "audit.createdEvent" : "audit.editedEvent",
          entityType: "event",
          entityId: event.id,
          detail: event.name,
        },
      );
    },
    [commit, state.events],
  );

  const inviteMember = useCallback<VaultContextValue["inviteMember"]>(
    (displayName, email, role) => {
      const id = newId("u");
      commit(
        (draft) => {
          draft.users.push({
            id,
            familyId: draft.settings.familyId,
            displayName,
            email,
            role,
            isActive: true,
            initials: displayName
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join(""),
          });
        },
        {
          actionKey: "audit.invitedMember",
          entityType: "user",
          entityId: id,
          detail: displayName,
        },
      );
    },
    [commit],
  );

  const deactivateMember = useCallback<VaultContextValue["deactivateMember"]>(
    (userId) => {
      commit(
        (draft) => {
          const user = draft.users.find((u) => u.id === userId);
          if (user) user.isActive = false;
        },
        {
          actionKey: "audit.deactivatedMember",
          entityType: "user",
          entityId: userId,
          detail: state.users.find((u) => u.id === userId)?.displayName ?? "—",
        },
      );
    },
    [commit, state.users],
  );

  const updateSettings = useCallback<VaultContextValue["updateSettings"]>(
    (patch) => {
      const before = state.settings.goldRatePerGram24k;
      commit(
        (draft) => {
          draft.settings = { ...draft.settings, ...patch };
          if (patch.goldRatePerGram24k != null) draft.settings.goldRateUpdatedOn = today();
        },
        patch.goldRatePerGram24k != null
          ? {
              actionKey: "audit.updatedGoldRate",
              entityType: "settings",
              entityId: "settings",
                  detail: `₹${before.toLocaleString("en-IN")} → ₹${patch.goldRatePerGram24k.toLocaleString("en-IN")}`,
            }
          : {
              actionKey: "audit.updatedSettings",
              entityType: "settings",
              entityId: "settings",
              detail: Object.keys(patch).join(", "),
            },
      );
    },
    [commit, state.settings.goldRatePerGram24k],
  );

  const markNotificationRead = useCallback<VaultContextValue["markNotificationRead"]>(
    (id) => {
      commit((draft) => {
        const n = draft.notifications.find((x) => x.id === id);
        if (n && !n.readAt) n.readAt = nowIso();
      }, null);
    },
    [commit],
  );

  const markAllNotificationsRead = useCallback(() => {
    commit((draft) => {
      for (const n of draft.notifications) if (!n.readAt) n.readAt = nowIso();
    }, null);
  }, [commit]);

  const switchUser = useCallback<VaultContextValue["switchUser"]>(
    (userId) => {
      commit((draft) => {
        draft.currentUserId = userId;
      }, null);
    },
    [commit],
  );

  const resetDemo = useCallback(() => {
    setState(structuredClone(seedState));
  }, []);

  const value: VaultContextValue = {
    state,
    hydrated,
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
    inviteMember,
    deactivateMember,
    updateSettings,
    markNotificationRead,
    markAllNotificationsRead,
    switchUser,
    resetDemo,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}

// ---- Derived helpers -------------------------------------------------------

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
