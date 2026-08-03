/**
 * Sample data for the clickable prototype.
 *
 * Everything here is fake but shaped exactly like the real schema, so screens
 * built against it keep working when the Supabase data layer replaces it.
 * Dates are anchored around DEMO_TODAY so the dashboard shows a realistic mix of
 * overdue, due-soon, and upcoming states.
 */
import type { VaultState } from "./types";
import { addDays, DEMO_TODAY } from "./format";

const FAMILY = "fam-1";
const d = (offset: number) => addDays(DEMO_TODAY, offset);
const ts = (offset: number, time = "10:30") => `${d(offset)}T${time}:00.000Z`;

export const seedState: VaultState = {
  currentUserId: "u1",

  settings: {
    familyId: FAMILY,
    familyName: "Our Family Vault",
    goldRatePerGram24k: 7420,
    goldRateUpdatedOn: d(-2),
    currency: "INR",
    dueSoonLeadDays: 3,
    eventReminderLeadDays: 3,
    // Prices are hidden until deliberately switched on in Settings.
    showPrices: false,
  },

  users: [
    { id: "u1", familyId: FAMILY, displayName: "Sivanesh", role: "admin", email: "sivanesh@example.com", isActive: true, initials: "SI" },
    { id: "u2", familyId: FAMILY, displayName: "Lakshmi", role: "admin", email: "lakshmi@example.com", isActive: true, initials: "LA" },
    { id: "u3", familyId: FAMILY, displayName: "Priya", role: "member", email: "priya@example.com", isActive: true, initials: "PR" },
    { id: "u4", familyId: FAMILY, displayName: "Arjun", role: "member", email: "arjun@example.com", isActive: true, initials: "AR" },
    { id: "u5", familyId: FAMILY, displayName: "Meena", role: "member", email: "meena@example.com", isActive: true, initials: "ME" },
  ],

  lockers: [
    { id: "l1", familyId: FAMILY, name: "SBI Locker", type: "bank", branch: "Anna Nagar", lockerNumber: "A-214", keyHolderId: "u1", visitIntervalDays: 90, lastVisitedOn: d(-96) },
    { id: "l2", familyId: FAMILY, name: "ICICI Locker", type: "bank", branch: "T. Nagar", lockerNumber: "C-08", keyHolderId: "u2", visitIntervalDays: 120, lastVisitedOn: d(-40) },
    { id: "l3", familyId: FAMILY, name: "Home Safe", type: "home", keyHolderId: "u1", visitIntervalDays: 30, lastVisitedOn: d(-8) },
  ],

  jewelry: [
    { id: "j1", familyId: FAMILY, name: "Temple Work Haram", category: "necklace", photos: [], grossWeight: 86.4, netGoldWeight: 78.2, stoneWeight: 8.2, purity: 22, hallmarkNo: "HM-2291-AC", purchaseDate: "2019-11-14", purchasePrice: 384000, jeweler: "Saravana Stores", notes: "Bridal set piece. Handle the kemp stones carefully.", status: "in_locker", ownerId: "u2", currentLockerId: "l1", isArchived: false, createdAt: ts(-420) },
    { id: "j2", familyId: FAMILY, name: "Antique Lakshmi Kasumalai", category: "necklace", photos: [], grossWeight: 62.1, netGoldWeight: 62.1, stoneWeight: 0, purity: 22, hallmarkNo: "HM-1180-KX", purchaseDate: "2016-05-02", purchasePrice: 198000, jeweler: "Lalitha Jewellery", status: "in_locker", ownerId: "u2", currentLockerId: "l1", isArchived: false, createdAt: ts(-400) },
    { id: "j3", familyId: FAMILY, name: "Diamond Drop Earrings", category: "earring", photos: [], grossWeight: 12.8, netGoldWeight: 9.4, stoneWeight: 3.4, purity: 18, hallmarkNo: "HM-7742-DD", purchaseDate: "2021-02-20", purchasePrice: 276000, jeweler: "Tanishq", notes: "VS clarity, certificate in the folder.", status: "with_member", ownerId: "u3", currentHolderId: "u3", expectedReturnOn: d(-6), isArchived: false, createdAt: ts(-380) },
    { id: "j4", familyId: FAMILY, name: "Gold Bangles (Pair)", category: "bangle", photos: [], grossWeight: 48.6, netGoldWeight: 48.6, stoneWeight: 0, purity: 22, hallmarkNo: "HM-3310-BG", purchaseDate: "2018-08-30", purchasePrice: 152000, jeweler: "Joyalukkas", status: "with_member", ownerId: "u2", currentHolderId: "u5", expectedReturnOn: d(2), isArchived: false, createdAt: ts(-360) },
    { id: "j5", familyId: FAMILY, name: "Ruby Stud Earrings", category: "earring", photos: [], grossWeight: 8.2, netGoldWeight: 6.1, stoneWeight: 2.1, purity: 22, purchaseDate: "2020-09-11", purchasePrice: 62000, jeweler: "Saravana Stores", status: "in_locker", ownerId: "u3", currentLockerId: "l2", isArchived: false, createdAt: ts(-340) },
    { id: "j6", familyId: FAMILY, name: "Men's Kada", category: "bracelet", photos: [], grossWeight: 34.2, netGoldWeight: 34.2, stoneWeight: 0, purity: 22, hallmarkNo: "HM-5567-KD", purchaseDate: "2022-01-08", purchasePrice: 168000, jeweler: "Bhima", status: "with_member", ownerId: "u4", currentHolderId: "u4", expectedReturnOn: d(9), isArchived: false, createdAt: ts(-300) },
    { id: "j7", familyId: FAMILY, name: "Sovereign Coins ×8", category: "coin", photos: [], grossWeight: 64.0, netGoldWeight: 64.0, stoneWeight: 0, purity: 22, purchaseDate: "2023-04-17", purchasePrice: 402000, jeweler: "SBI Gold", notes: "Sealed, do not open packaging.", status: "in_locker", ownerId: "u1", currentLockerId: "l1", isArchived: false, createdAt: ts(-280) },
    { id: "j8", familyId: FAMILY, name: "Pearl & Gold Choker", category: "necklace", photos: [], grossWeight: 41.3, netGoldWeight: 32.8, stoneWeight: 8.5, purity: 22, hallmarkNo: "HM-8891-PC", purchaseDate: "2017-12-01", purchasePrice: 142000, jeweler: "Prince Jewellery", status: "at_jeweler", ownerId: "u2", isArchived: false, createdAt: ts(-260), notes: "Clasp replacement, quoted 8 days." },
    { id: "j9", familyId: FAMILY, name: "Baby Anklets", category: "anklet", photos: [], grossWeight: 18.4, netGoldWeight: 0, stoneWeight: 0, purity: 22, purchaseDate: "2024-06-22", purchasePrice: 24000, jeweler: "Local silversmith", notes: "Silver, not gold — kept here for completeness.", status: "in_locker", ownerId: "u3", currentLockerId: "l3", isArchived: false, createdAt: ts(-240) },
    { id: "j10", familyId: FAMILY, name: "Thin Daily Chain", category: "chain", photos: [], grossWeight: 11.2, netGoldWeight: 11.2, stoneWeight: 0, purity: 22, hallmarkNo: "HM-2204-CH", purchaseDate: "2023-10-05", purchasePrice: 68000, jeweler: "Tanishq", status: "with_member", ownerId: "u3", currentHolderId: "u3", expectedReturnOn: d(-1), isArchived: false, createdAt: ts(-200) },
    { id: "j11", familyId: FAMILY, name: "Emerald Cocktail Ring", category: "ring", photos: [], grossWeight: 9.6, netGoldWeight: 7.2, stoneWeight: 2.4, purity: 18, purchaseDate: "2022-07-19", purchasePrice: 118000, jeweler: "Tanishq", status: "in_locker", ownerId: "u2", currentLockerId: "l2", isArchived: false, createdAt: ts(-180) },
    { id: "j12", familyId: FAMILY, name: "Wedding Ring Pair", category: "ring", photos: [], grossWeight: 14.8, netGoldWeight: 14.8, stoneWeight: 0, purity: 22, hallmarkNo: "HM-6612-WR", purchaseDate: "2015-02-09", purchasePrice: 44000, jeweler: "Lalitha Jewellery", status: "in_locker", ownerId: "u1", currentLockerId: "l3", isArchived: false, createdAt: ts(-160) },
    { id: "j13", familyId: FAMILY, name: "Jhumka Set", category: "earring", photos: [], grossWeight: 22.4, netGoldWeight: 20.1, stoneWeight: 2.3, purity: 22, purchaseDate: "2021-11-28", purchasePrice: 96000, jeweler: "Saravana Stores", status: "in_transit", ownerId: "u5", isArchived: false, createdAt: ts(-140), notes: "Moving from ICICI to SBI locker." },
    { id: "j14", familyId: FAMILY, name: "Mango Design Necklace", category: "necklace", photos: [], grossWeight: 56.7, netGoldWeight: 51.3, stoneWeight: 5.4, purity: 22, hallmarkNo: "HM-9903-MN", purchaseDate: "2020-03-14", purchasePrice: 244000, jeweler: "Joyalukkas", status: "in_locker", ownerId: "u2", currentLockerId: "l1", isArchived: false, createdAt: ts(-120) },
    // Uses the free-text category: the fixed list has no word for this, so the
    // family typed one and it reads that way everywhere.
    { id: "j15", familyId: FAMILY, name: "Bridal Oddiyanam", category: "other", customCategory: "Oddiyanam", photos: [], grossWeight: 94.5, netGoldWeight: 88.0, stoneWeight: 6.5, purity: 22, hallmarkNo: "HM-4471-OD", purchaseDate: "2019-11-14", purchasePrice: 421000, jeweler: "Saravana Stores", notes: "Waist belt from the bridal set. Store flat.", status: "in_locker", ownerId: "u2", currentLockerId: "l1", isArchived: false, createdAt: ts(-100) },
  ],

  movements: [
    { id: "m1", familyId: FAMILY, jewelryId: "j3", type: "takeout", fromLocation: "SBI Locker", toLocation: "Priya", actorId: "u1", holderId: "u3", reason: "Cousin's engagement", takenAt: ts(-20), expectedReturnOn: d(-6) },
    { id: "m2", familyId: FAMILY, jewelryId: "j4", type: "takeout", fromLocation: "SBI Locker", toLocation: "Meena", actorId: "u2", holderId: "u5", reason: "Ramya's wedding", takenAt: ts(-5), expectedReturnOn: d(2), eventId: "e1" },
    { id: "m3", familyId: FAMILY, jewelryId: "j6", type: "takeout", fromLocation: "Home Safe", toLocation: "Arjun", actorId: "u1", holderId: "u4", reason: "Daily wear", takenAt: ts(-12), expectedReturnOn: d(9) },
    { id: "m4", familyId: FAMILY, jewelryId: "j10", type: "takeout", fromLocation: "Home Safe", toLocation: "Priya", actorId: "u3", holderId: "u3", reason: "Office", takenAt: ts(-9), expectedReturnOn: d(-1) },
    { id: "m5", familyId: FAMILY, jewelryId: "j8", type: "service", fromLocation: "ICICI Locker", toLocation: "Prince Jewellery", actorId: "u2", reason: "Clasp replacement", takenAt: ts(-7), expectedReturnOn: d(1) },
    { id: "m6", familyId: FAMILY, jewelryId: "j13", type: "transfer", fromLocation: "ICICI Locker", toLocation: "SBI Locker", actorId: "u1", reason: "Consolidating bridal set", takenAt: ts(-1) },
    { id: "m7", familyId: FAMILY, jewelryId: "j1", type: "takeout", fromLocation: "SBI Locker", toLocation: "Lakshmi", actorId: "u2", holderId: "u2", reason: "Deepavali", takenAt: ts(-280), expectedReturnOn: d(-274), returnedAt: ts(-273) },
    { id: "m8", familyId: FAMILY, jewelryId: "j14", type: "takeout", fromLocation: "SBI Locker", toLocation: "Lakshmi", actorId: "u2", holderId: "u2", reason: "Family function", takenAt: ts(-60), expectedReturnOn: d(-55), returnedAt: ts(-56) },
    { id: "m9", familyId: FAMILY, jewelryId: "j2", type: "takeout", fromLocation: "SBI Locker", toLocation: "Priya", actorId: "u1", holderId: "u3", reason: "Photoshoot", takenAt: ts(-120), expectedReturnOn: d(-117), returnedAt: ts(-118) },
  ],

  events: [
    { id: "e1", familyId: FAMILY, name: "Ramya's Wedding", startsOn: d(1), endsOn: d(3), location: "Chennai", notes: "Reception on day 2 — heavier set needed.", jewelryIds: ["j4", "j1", "j14"] },
    { id: "e2", familyId: FAMILY, name: "Deepavali", startsOn: d(88), endsOn: d(90), location: "Home", jewelryIds: ["j2", "j13"] },
    { id: "e3", familyId: FAMILY, name: "Arjun's Birthday", startsOn: d(24), endsOn: d(24), location: "Home", jewelryIds: ["j6"] },
  ],

  documents: [
    { id: "d1", familyId: FAMILY, jewelryId: "j1", type: "invoice", fileName: "saravana-invoice-2019.pdf", uploadedAt: ts(-410) },
    { id: "d2", familyId: FAMILY, jewelryId: "j1", type: "hallmark", fileName: "hallmark-HM-2291-AC.jpg", uploadedAt: ts(-410) },
    { id: "d3", familyId: FAMILY, jewelryId: "j3", type: "invoice", fileName: "tanishq-invoice-2021.pdf", uploadedAt: ts(-370) },
    { id: "d4", familyId: FAMILY, jewelryId: "j3", type: "hallmark", fileName: "diamond-cert-7742.pdf", uploadedAt: ts(-370) },
    { id: "d5", familyId: FAMILY, jewelryId: "j7", type: "invoice", fileName: "sbi-gold-coins.pdf", uploadedAt: ts(-275) },
    { id: "d6", familyId: FAMILY, jewelryId: "j2", type: "insurance", fileName: "policy-2026.pdf", uploadedAt: ts(-200), expiresOn: d(21) },
    { id: "d7", familyId: FAMILY, jewelryId: "j14", type: "invoice", fileName: "joyalukkas-2020.pdf", uploadedAt: ts(-115) },
    { id: "d8", familyId: FAMILY, jewelryId: "j12", type: "hallmark", fileName: "hallmark-HM-6612-WR.jpg", uploadedAt: ts(-155) },
  ],

  // `actionKey` is a message-catalog key, not display text — see AuditEntry.
  audit: [
    { id: "a1", familyId: FAMILY, actorId: "u1", actionKey: "audit.startedTransfer", entityType: "jewelry", entityId: "j13", detail: "Jhumka Set · ICICI Locker → SBI Locker", at: ts(-1, "09:15") },
    { id: "a2", familyId: FAMILY, actorId: "u2", actionKey: "audit.sentForService", entityType: "jewelry", entityId: "j8", detail: "Pearl & Gold Choker → Prince Jewellery", at: ts(-7, "16:40") },
    { id: "a3", familyId: FAMILY, actorId: "u2", actionKey: "audit.tookOut", entityType: "jewelry", entityId: "j4", detail: "Gold Bangles (Pair) → Meena", at: ts(-5, "11:05") },
    { id: "a4", familyId: FAMILY, actorId: "u3", actionKey: "audit.tookOut", entityType: "jewelry", entityId: "j10", detail: "Thin Daily Chain → Priya", at: ts(-9, "08:20") },
    { id: "a5", familyId: FAMILY, actorId: "u1", actionKey: "audit.updatedGoldRate", entityType: "settings", entityId: "settings", detail: "₹7,380 → ₹7,420", at: ts(-2, "07:55") },
    { id: "a6", familyId: FAMILY, actorId: "u1", actionKey: "audit.addedItem", entityType: "jewelry", entityId: "j14", detail: "Mango Design Necklace", at: ts(-120, "18:30") },
  ],

  // Text is not stored: `kind` picks a template and `params` fills it, so these
  // render in whichever language the reader has selected.
  notifications: [
    { id: "n1", familyId: FAMILY, kind: "overdue", params: { item: "Diamond Drop Earrings", holder: "Priya", days: 6 }, jewelryId: "j3", createdAt: ts(0, "08:00") },
    { id: "n2", familyId: FAMILY, kind: "overdue", params: { item: "Thin Daily Chain", holder: "Priya", days: 1 }, jewelryId: "j10", createdAt: ts(0, "08:00") },
    { id: "n3", familyId: FAMILY, kind: "event_upcoming", params: { event: "Ramya's Wedding", days: 1, total: 3, pending: 2 }, eventId: "e1", createdAt: ts(0, "08:00") },
    { id: "n4", familyId: FAMILY, kind: "due_soon", params: { item: "Gold Bangles (Pair)", holder: "Meena", days: 2 }, jewelryId: "j4", createdAt: ts(0, "08:00") },
    { id: "n5", familyId: FAMILY, kind: "locker_visit", params: { locker: "SBI Locker", days: 96, interval: 90 }, createdAt: ts(-1, "08:00"), readAt: ts(-1, "20:10") },
    { id: "n6", familyId: FAMILY, kind: "document_expiring", params: { docType: "Insurance", days: 21, item: "Antique Lakshmi Kasumalai", file: "policy-2026.pdf" }, jewelryId: "j2", createdAt: ts(-2, "08:00"), readAt: ts(-2, "09:00") },
  ],
};
