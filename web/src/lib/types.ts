/**
 * Domain model for the Jewelry Vault.
 *
 * These types mirror the Postgres schema described in Jewelry_Vault_Plan_v2.md.
 * Keeping them identical means swapping the fixture data layer for Supabase is a
 * substitution rather than a rewrite.
 *
 * Dates are ISO date strings ("YYYY-MM-DD") or ISO timestamps, never Date
 * objects, so that state survives a JSON round-trip through localStorage.
 */

export type Role = "admin" | "member";

/**
 * Where an item is right now. Transitions are enforced in `store.tsx`;
 * see the state machine in the plan document.
 */
export type ItemStatus =
  | "in_locker"
  | "with_member"
  | "in_transit"
  | "at_jeweler"
  | "lost";

export type MovementType =
  | "takeout"
  | "return"
  | "transfer"
  | "service"
  | "lost";

export type LockerType = "bank" | "home";

export type DocumentType =
  | "invoice"
  | "hallmark"
  | "insurance"
  | "warranty"
  | "other";

export type JewelryCategory =
  | "necklace"
  | "bangle"
  | "ring"
  | "earring"
  | "chain"
  | "bracelet"
  | "anklet"
  | "coin"
  | "other";

export interface User {
  id: string;
  familyId: string;
  displayName: string;
  role: Role;
  email: string;
  isActive: boolean;
  /** Two-letter initials fallback used when there is no avatar. */
  initials: string;
}

export interface Locker {
  id: string;
  familyId: string;
  name: string;
  type: LockerType;
  branch?: string;
  lockerNumber?: string;
  keyHolderId?: string;
  /** How often the family intends to physically verify contents. */
  visitIntervalDays?: number;
  lastVisitedOn?: string;
}

export interface JewelryItem {
  id: string;
  familyId: string;

  // Descriptive
  name: string;
  category: JewelryCategory;
  photos: string[];
  grossWeight: number;
  netGoldWeight: number;
  stoneWeight: number;
  /** Karat purity, e.g. 22 for 22K. */
  purity: number;
  hallmarkNo?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  jeweler?: string;
  notes?: string;

  // State — the part v1 of the plan was missing entirely
  status: ItemStatus;
  /** Whose jewelry it is. Distinct from who physically holds it. */
  ownerId: string;
  /** Who physically has it right now; undefined when it is in a locker. */
  currentHolderId?: string;
  currentLockerId?: string;
  expectedReturnOn?: string;

  /** Admin "delete" archives instead, so movement history is never orphaned. */
  isArchived: boolean;
  createdAt: string;
}

/** Append-only. Rows are never updated or deleted, only closed via returnedAt. */
export interface Movement {
  id: string;
  familyId: string;
  jewelryId: string;
  type: MovementType;
  fromLocation: string;
  toLocation: string;
  /** Who performed the action. */
  actorId: string;
  /** Who took custody, for takeouts. */
  holderId?: string;
  reason?: string;
  takenAt: string;
  expectedReturnOn?: string;
  returnedAt?: string;
  eventId?: string;
}

export interface FamilyEvent {
  id: string;
  familyId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  location?: string;
  notes?: string;
  /** Items earmarked for this event. */
  jewelryIds: string[];
}

export interface VaultDocument {
  id: string;
  familyId: string;
  jewelryId: string;
  type: DocumentType;
  fileName: string;
  uploadedAt: string;
  expiresOn?: string;
}

export interface AuditEntry {
  id: string;
  familyId: string;
  actorId: string;
  /**
   * Message-catalog key for the action verb ("audit.tookOut"), not display text,
   * so the log reads in whichever language the viewer has chosen.
   */
  actionKey: string;
  entityType: "jewelry" | "movement" | "locker" | "event" | "user" | "settings";
  entityId: string;
  /**
   * Supporting context. Deliberately built from proper nouns, numbers and arrows
   * ("Gold Bangles → Meena") rather than sentences, so it reads the same in both
   * languages without needing a template per action.
   */
  detail: string;
  at: string;
}

export interface AppNotification {
  id: string;
  familyId: string;
  kind:
    | "overdue"
    | "due_soon"
    | "event_upcoming"
    | "locker_visit"
    | "missing_document"
    | "document_expiring";
  /**
   * Values interpolated into the notification's message template.
   *
   * Text is not stored — the kind selects a template and this fills it, so the
   * same notification renders in whatever language the reader has chosen. The
   * Cloudflare Worker will do the same when it sends push, using each
   * recipient's stored language preference.
   */
  params: Record<string, string | number>;
  jewelryId?: string;
  eventId?: string;
  createdAt: string;
  readAt?: string;
}

export interface Settings {
  familyId: string;
  familyName: string;
  /** Manually maintained in Phase 1; automatic rate fetching comes later. */
  goldRatePerGram24k: number;
  goldRateUpdatedOn: string;
  currency: string;
  dueSoonLeadDays: number;
  eventReminderLeadDays: number;
}

export interface VaultState {
  users: User[];
  lockers: Locker[];
  jewelry: JewelryItem[];
  movements: Movement[];
  events: FamilyEvent[];
  documents: VaultDocument[];
  audit: AuditEntry[];
  notifications: AppNotification[];
  settings: Settings;
  /** The signed-in user. Auth is stubbed until Supabase is wired in. */
  currentUserId: string;
}
