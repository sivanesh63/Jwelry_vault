"use client";

/**
 * Bilingual support: English and Tamil.
 *
 * Client-side rather than route-based (/ta/...). Static export rules out the
 * middleware that locale routing needs, and a per-device preference is the right
 * model for a PWA anyway — each family member picks their language once.
 *
 * The Tamil catalog is typed against the English one, so a missing or misspelled
 * key is a compile error rather than a string that silently falls back.
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
import { configureFormatting, daysBetween } from "./format";
import type {
  DocumentType,
  ItemStatus,
  JewelryCategory,
  MovementType,
  AppNotification,
} from "./types";

export type Lang = "en" | "ta";

const STORAGE_KEY = "jv:lang:v1";

export const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  ta: "தமிழ்",
};

const en = {
  // ---- Navigation ----
  "nav.dashboard": "Dashboard",
  "nav.home": "Home",
  "nav.jewelry": "Jewelry",
  "nav.movements": "Movements",
  "nav.events": "Events",
  "nav.lockers": "Lockers",
  "nav.members": "Family members",
  "nav.documents": "Documents",
  "nav.scan": "Scan QR",
  "nav.scanShort": "Scan",
  "nav.audit": "Audit log",
  "nav.settings": "Settings",
  "nav.notifications": "Notifications",
  "nav.more": "More",
  "nav.viewingAs": "Viewing as (prototype only)",
  "nav.close": "Close",

  // ---- Shared ----
  "common.add": "Add",
  "common.edit": "Edit",
  "common.save": "Save",
  "common.saveChanges": "Save changes",
  "common.cancel": "Cancel",
  "common.update": "Update",
  "common.clear": "Clear",
  "common.selectAll": "Select all",
  "common.viewAll": "All",
  "common.upload": "Upload",
  "common.loading": "Loading…",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.you": "you",
  "common.everyone": "Everyone",
  "common.reset": "Reset",
  "common.remove": "Remove",
  "common.notFound": "Not found",
  "common.search": "Search",
  "common.reason": "Reason",
  "common.owner": "Owner",
  "common.status": "Status",
  "common.location": "Location",
  "common.none": "—",
  "common.unknown": "Unknown",
  "common.open": "Open",
  "common.closed": "Closed",
  "common.items": "items",
  "common.item": "item",

  // ---- Units and values ----
  "unit.gram": "g",
  "unit.purity": "{k}K",
  "unit.perGram": "{value}/g",

  // ---- Relative dates ----
  "date.today": "today",
  "date.tomorrow": "tomorrow",
  "date.yesterday": "yesterday",
  "date.inDays": "in {n} days",
  "date.daysAgo": "{n} days ago",

  // ---- Item status ----
  "status.in_locker": "In locker",
  "status.with_member": "With member",
  "status.in_transit": "In transit",
  "status.at_jeweler": "At jeweler",
  "status.lost": "Lost",
  "status.any": "Any status",

  // ---- Categories ----
  "category.necklace": "Necklace",
  "category.bangle": "Bangle",
  "category.ring": "Ring",
  "category.earring": "Earring",
  "category.chain": "Chain",
  "category.bracelet": "Bracelet",
  "category.anklet": "Anklet",
  "category.coin": "Coin",
  "category.other": "Other",
  "category.any": "Any category",

  // ---- Movement types ----
  "movementType.takeout": "Takeout",
  "movementType.return": "Return",
  "movementType.transfer": "Transfer",
  "movementType.service": "Service",
  "movementType.lost": "Lost",

  // ---- Dashboard ----
  "dashboard.goldRate": "Gold rate {rate} (24K), updated {when}.",
  "dashboard.overdueTitle": "{n} item(s) overdue",
  "dashboard.returnItems": "Return items",
  "dashboard.totalItems": "Total items",
  "dashboard.archived": "{n} archived",
  "dashboard.netGold": "Net gold",
  "dashboard.excludingStones": "excluding stones",
  "dashboard.estValue": "Estimated value",
  "dashboard.atCurrentRate": "at current rate",
  "dashboard.outsideLocker": "Outside locker",
  "dashboard.secured": "{n} secured",
  "dashboard.goldInLocker": "Gold in locker",
  "dashboard.goldOutside": "Gold outside",
  "dashboard.itemsInLocker": "{n} items",
  "dashboard.splitSub": "{n} in locker · {out} out",
  "dashboard.outOfLocker": "Out of the locker",
  "dashboard.awayCount": "{n} item(s) away from a locker",
  "dashboard.allSecured": "Everything is secured",
  "dashboard.allSecuredDesc": "No items are currently outside a locker.",
  "dashboard.upcomingEvents": "Upcoming events",
  "dashboard.noEvents": "No events in the next 30 days",
  "dashboard.readyCount": "{ready}/{total} ready",
  "dashboard.needsAttention": "Needs attention",
  "dashboard.dueBackSoon": "Due back soon",
  "dashboard.lockerVisitsDue": "Locker visits due",
  "dashboard.inTransitCount": "Items in transit",
  "dashboard.atJewelerCount": "At the jeweler",

  // ---- Jewelry list ----
  "jewelry.title": "Jewelry",
  "jewelry.summary": "{count} item(s) · {weight} · {value}",
  "jewelry.searchPlaceholder": "Search name, hallmark, holder, location…",
  "jewelry.filters": "Filters",
  "jewelry.anyone": "Anyone",
  "jewelry.sortRecent": "Newest first",
  "jewelry.sortName": "Name A–Z",
  "jewelry.sortWeight": "Heaviest",
  "jewelry.sortValue": "Most valuable",
  "jewelry.noMatch": "No matching items",
  "jewelry.noMatchDesc": "Try clearing the search or filters.",
  "jewelry.addItem": "Add an item",

  // ---- Jewelry detail ----
  "item.notFound": "Item not found",
  "item.notFoundDesc": "It may have been archived, or the link is out of date.",
  "item.backToJewelry": "Back to jewelry",
  "item.estimatedFrom": "estimated from {weight} net gold at current rate",
  "item.takeOut": "Take out",
  "item.transfer": "Transfer",
  "item.sendForService": "Send for service",
  "item.return": "Return",
  "item.extendDue": "Extend due date",
  "item.confirmArrival": "Confirm arrival at {locker}",
  "item.collectFromJeweler": "Collect from jeweler",
  "item.currentPosition": "Current position",
  "item.heldBy": "Held by",
  "item.expectedBack": "Expected back",
  "item.specification": "Specification",
  "item.grossWeight": "Gross weight",
  "item.netGoldWeight": "Net gold weight",
  "item.stoneWeight": "Stone weight",
  "item.purity": "Purity",
  "item.hallmark": "Hallmark",
  "item.jeweler": "Jeweler",
  "item.purchased": "Purchased",
  "item.purchasePrice": "Purchase price",
  "item.notes": "Notes",
  "item.documents": "Documents",
  "item.documentsCount": "{n} on file",
  "item.noDocuments": "No documents yet",
  "item.noDocumentsDesc": "Invoice, hallmark certificate, insurance and warranty go here.",
  "item.history": "History",
  "item.historyDesc": "Movements are permanent and never edited",
  "item.noMovements": "No movements recorded",
  "item.closedOn": "Closed {when}",
  "item.label": "Label",
  "item.labelDesc": "Stable ID — printed labels never need reprinting",
  "item.labelHint": "Print this and keep it with the item. Any phone camera opens the vault here.",
  "item.printLabel": "Print label",
  "item.downloadLabel": "Download",
  "item.openScanner": "Open scanner",
  "item.archive": "Archive item",
  "item.archiveConfirm": "Archive this item?",
  "item.archiveBody":
    "Archiving hides {name} from the inventory but keeps its full movement history. Nothing is deleted.",
  "item.serviceTitle": "Send for service",
  "item.serviceShop": "Jeweler",
  "item.serviceShopPlaceholder": "Shop name",
  "item.serviceReasonPlaceholder": "Resize, polish, clasp repair…",
  "item.expectedBackLabel": "Expected back",
  "item.send": "Send",
  "item.collectTitle": "Collect from jeweler",
  "item.collectBody": "Which locker is it going back into?",
  "item.extendTitle": "Extend due date",
  "item.extendBody":
    "Currently due {date}. The change is recorded in the audit log, so the original promise stays visible.",
  "item.newReturnDate": "New return date",
  "item.extend": "Extend",
  "item.by": "by",

  // ---- Add / edit ----
  "edit.addTitle": "Add jewelry",
  "edit.editTitle": "Edit jewelry",
  "edit.photos": "Photos",
  "edit.photosDesc": "Compressed on upload to stay inside free storage",
  "edit.addPhoto": "Add photo",
  "edit.photosNote":
    "Photos are resized to roughly 400 KB in the browser before upload — the difference between fitting ~600 photos in the free tier and ~80. Location data is removed.",
  "edit.uploading": "Encrypting…",
  "edit.removePhoto": "Remove photo",
  "edit.compressed": "{from} → {to}",
  "members.pendingTitle": "Waiting to be let in",
  "members.pendingBody":
    "They have signed in and set a passphrase. Admitting them hands over the key that decrypts the vault — done here, on your device.",
  "members.admit": "Admit",
  "members.notSignedIn": "Has not signed in yet",
  "members.notAdmitted": "Cannot read the vault yet",
  "members.inviteThenAdmit":
    "They get an email to set a password. Once they have signed in and chosen a passphrase, come back here and admit them — until then they can see nothing.",
  "settings.storage": "Photo storage",
  "settings.storageDesc": "Supabase gives 1 GB free",
  "settings.storageUsed": "{used} of {total}",
  "settings.storagePhotos": "{n} photos across {items} items",
  "settings.storageRoom": "Room for roughly {n} more at this size",
  "edit.basics": "Basics",
  "edit.scanInvoice": "Scan invoice",
  "edit.name": "Name",
  "edit.namePlaceholder": "Temple work haram",
  "edit.category": "Category",
  "edit.customCategory": "Category name",
  "edit.customCategoryHint": "Type whatever this piece is called",
  "edit.customCategoryPlaceholder": "Oddiyanam, vanki, nose ring…",
  "edit.ownerHint": "Who it belongs to, not who is wearing it",
  "edit.storedIn": "Stored in",
  "edit.notesPlaceholder": "Handling instructions, which set it belongs to…",
  "edit.weightPurity": "Weight and purity",
  "edit.grossWeightG": "Gross weight (g)",
  "edit.stoneWeightG": "Stone weight (g)",
  "edit.netGoldWeightG": "Net gold weight (g)",
  "edit.netGoldHint": "Used for valuation",
  "edit.purityK": "Purity",
  "edit.provenance": "Purchase and provenance",
  "edit.hallmarkNo": "Hallmark number",
  "edit.purchaseDate": "Purchase date",
  "edit.scannedNote": "Highlighted fields came from the scanned invoice — check them before saving.",
  "edit.addAction": "Add item",

  // ---- Movements ----
  "movements.title": "Movements",
  "movements.subtitle": "Every movement is permanent — rows are closed, never edited or deleted.",
  "movements.currentlyOut": "Currently out ({n})",
  "movements.history": "History ({n})",
  "movements.nothingOut": "Nothing is out",
  "movements.nothingOutDesc": "Every item is accounted for in a locker.",
  "movements.noDueDate": "No due date",
  "movements.due": "Due {date}",
  "movements.confirmArrival": "Confirm arrival",
  "movements.allMovements": "All movements",
  "movements.archivedItem": "Archived item",

  // ---- Take out ----
  "takeout.title": "Take out",
  "takeout.selectItems": "Select items",
  "takeout.selectedOf": "{selected} of {total} selected",
  "takeout.nothingAvailable": "Nothing available",
  "takeout.nothingAvailableDesc": "Only items currently in a locker can be taken out.",
  "takeout.details": "Details",
  "takeout.whoIsTaking": "Who is taking it",
  "takeout.forEvent": "For an event?",
  "takeout.forEventHint": "Sets the due date to the day after it ends",
  "takeout.notForEvent": "Not for an event",
  "takeout.reasonPlaceholder": "Wedding, daily wear, photoshoot…",
  "takeout.expectedReturn": "Expected return",
  "takeout.reminderNote":
    "A reminder fires the morning these items are due back ({date}), and again each day they stay overdue.",
  "takeout.action": "Take out {n} item(s)",

  // ---- Return ----
  "return.title": "Return items",
  "return.subtitle":
    "Select only what is physically coming back — returning 3 of 5 items is normal and leaves the rest open.",
  "return.currentlyOut": "Currently out",
  "return.nothingToReturn": "Nothing to return",
  "return.nothingToReturnDesc": "No items are with a family member.",
  "return.destination": "Where is it going",
  "return.locker": "Locker",
  "return.visitNote":
    "Returning also records a visit to the chosen locker, which resets its verification reminder.",
  "return.action": "Return {n} item(s)",

  // ---- Transfer ----
  "transfer.title": "Transfer between lockers",
  "transfer.subtitle":
    "Items move through an in transit state so they are never invisible mid-move. Confirm arrival once they are physically placed.",
  "transfer.inTransitCount": "{n} item(s) in transit",
  "transfer.confirmAll": "Confirm all",
  "transfer.arrivedAt": "Arrived at {locker}",
  "transfer.selectItems": "Select items",
  "transfer.selectedCount": "{n} selected",
  "transfer.fromAny": "From any locker",
  "transfer.fromLocker": "From {locker}",
  "transfer.noneAvailable": "No items available",
  "transfer.noneAvailableDesc": "Pick a different source locker, or a different destination.",
  "transfer.destination": "Destination",
  "transfer.moveTo": "Move to",
  "transfer.reasonPlaceholder": "Consolidating the bridal set…",
  "transfer.start": "Start transfer",

  // ---- Lockers ----
  "lockers.title": "Lockers",
  "lockers.subtitle": "{count} locations · {items} items secured",
  "lockers.items": "items",
  "lockers.gross": "gross",
  "lockers.value": "value",
  "lockers.shareOfVault": "Share of vault",
  "lockers.visitOverdue": "Visit overdue",
  "lockers.verified": "Verified",
  "lockers.neverVisited": "Never visited",
  "lockers.visitInterval": "{days} days ago · every {interval} days",
  "lockers.verifyNow": "Verify now",
  "lockers.keyHolder": "Key holder: {name}",
  "lockers.unassigned": "unassigned",
  "lockers.viewContents": "View contents",
  "lockers.addTitle": "Add locker",
  "lockers.editTitle": "Edit locker",
  "lockers.name": "Name",
  "lockers.namePlaceholder": "SBI Locker",
  "lockers.type": "Type",
  "lockers.typeBank": "Bank locker",
  "lockers.typeHome": "Home safe",
  "lockers.keyHolderLabel": "Key holder",
  "lockers.branch": "Branch",
  "lockers.number": "Locker number",
  "lockers.verifyEvery": "Verify every (days)",
  "lockers.verifyEveryHint": "Drives the locker visit reminder",

  // ---- Events ----
  "events.title": "Events",
  "events.subtitle": "Attach jewelry to an occasion, then take it all out in one step.",
  "events.noUpcoming": "No upcoming events",
  "events.noUpcomingDesc": "Create one to plan which jewelry is needed and when it comes back.",
  "events.past": "Past events",
  "events.itemsReady": "Items ready",
  "events.newTitle": "New event",
  "events.editTitle": "Edit event",
  "events.name": "Name",
  "events.namePlaceholder": "Ramya's wedding",
  "events.starts": "Starts",
  "events.ends": "Ends",
  "events.location": "Location",
  "events.notes": "Notes",

  // ---- Event detail ----
  "event.notFound": "Event not found",
  "event.backToEvents": "Back to events",
  "event.collected": "{collected} of {total} items collected",
  "event.stillInLocker": "{n} still in a locker. Due back {date} once taken.",
  "event.allOut": "Everything for this event is out of the locker.",
  "event.takeOutN": "Take out {n}",
  "event.returnAll": "Return all",
  "event.attached": "Attached jewelry",
  "event.attachedCount": "{n} item(s)",
  "event.nothingAttached": "Nothing attached yet",
  "event.nothingAttachedDesc": "Pick the pieces needed for this occasion.",
  "event.attach": "Attach",
  "event.attachJewelry": "Attach jewelry",
  "event.filterByOwner": "Filter by owner",
  "event.ownerAll": "All owners",
  "event.noneMatchOwner": "No jewelry for the selected owners",
  "event.returnAllTitle": "Return all event items",
  "event.returnAllBody": "Returning {n} item(s). Which locker are they going into?",
  "event.saveN": "Save {n} item(s)",

  // ---- Members ----
  "members.title": "Family members",
  "members.subtitle": "{n} active",
  "members.invite": "Invite",
  "members.inviteOnly":
    "This vault is invite-only. New members receive an email invitation and set their own password — there is no public sign-up page.",
  "members.owns": "owns",
  "members.holding": "holding",
  "members.ownedValue": "owned value",
  "members.currentlyHolding": "Currently holding",
  "members.deactivate": "Deactivate",
  "members.reactivate": "Reactivate",
  "members.inactive": "inactive",
  "members.inviteTitle": "Invite a family member",
  "members.name": "Name",
  "members.namePlaceholder": "Priya",
  "members.email": "Email",
  "members.emailHint": "They receive a link to set their own password",
  "members.role": "Role",
  "members.roleHint": "Admins can add items, configure lockers, and invite others",
  "members.roleAdmin": "Admin",
  "members.roleMember": "Member",
  "members.sendInvite": "Send invite",

  // ---- Documents ----
  "documents.title": "Documents",
  "documents.subtitle": "{files} files across {items} items",
  "documents.expiringTitle": "{n} document(s) expiring within 60 days",
  "documents.expiresOn": "expires {date}",
  "documents.missingTitle": "Missing an invoice",
  "documents.missingDesc": "{n} item(s) with no invoice on file",
  "documents.allTypes": "All document types",
  "documents.none": "No documents",
  "documents.noneDesc": "Upload invoices and certificates here.",
  "documents.archivedItem": "Archived item",
  "docType.invoice": "Invoice",
  "docType.hallmark": "Hallmark certificate",
  "docType.insurance": "Insurance",
  "docType.warranty": "Warranty",
  "docType.other": "Other",

  // ---- Scan ----
  "scan.title": "Scan",
  "scan.subtitle": "Every item has a stable ID, so printed labels never need reprinting.",
  "scan.modeLookup": "Look up an item",
  "scan.modeVerify": "Verify a locker",
  "scan.cameraNote":
    "For counting a locker. To open one item, your phone's own camera app reads these labels.",
  "scan.startCamera": "Start camera",
  "scan.stopCamera": "Stop",
  "scan.pointAtLabel": "Point at a label",
  "scan.cameraDenied":
    "No camera access. Allow it in your browser settings, or type the item ID below.",
  "scan.enterId": "Item ID",
  "scan.enterIdPlaceholder": "Paste a link or item ID",
  "scan.lookUp": "Look up",
  "scan.unknownCode": "That code does not match anything in this vault.",
  "scan.scanned": "Scanned",
  "scan.nothingScanned": "Nothing scanned yet",
  "scan.nothingScannedDesc": "Start the camera, or type an item ID above.",
  "scan.openDetails": "Open details",
  "scan.verification": "Locker verification",
  "scan.confirmedOf": "{seen} of {total} confirmed",
  "scan.emptyLocker": "This locker is empty",
  "scan.allAccounted": "All {n} items accounted for",
  "scan.recordVisit": "Record visit",
  "scan.notScanned": "{n} not yet scanned",
  "scan.keepScanning": "Keep scanning, or investigate any that cannot be found: {names}.",

  // ---- Notifications ----
  "notifications.title": "Notifications",
  "notifications.unread": "{n} unread",
  "notifications.allCaughtUp": "All caught up",
  "notifications.markAllRead": "Mark all read",
  "notifications.pushTitle": "Turn on push notifications",
  "notifications.pushBody":
    "On iPhone, add this app to your Home Screen first — Safari only delivers push to installed apps. Then allow notifications when prompted.",
  "notifications.enable": "Enable notifications",
  "notifications.empty": "Nothing to report",
  "notifications.emptyDesc": "Reminders about overdue items, events and locker visits appear here.",
  "notifications.footer":
    "Reminders are sent by a scheduled Cloudflare Worker, not by this app — so they arrive even when nobody has it open.",
  "notifKind.overdue": "Overdue",
  "notifKind.due_soon": "Due soon",
  "notifKind.event_upcoming": "Event",
  "notifKind.locker_visit": "Locker",
  "notifKind.missing_document": "Document",
  "notifKind.document_expiring": "Document",

  // Notification message templates. Filled from AppNotification.params so the
  // same stored row renders in the reader's language.
  "notif.overdue.title": "{item} overdue",
  "notif.overdue.body": "With {holder}, due {days} day(s) ago.",
  "notif.due_soon.title": "{item} due in {days} day(s)",
  "notif.due_soon.body": "With {holder}.",
  "notif.event_upcoming.title": "{event} starts in {days} day(s)",
  "notif.event_upcoming.body": "{total} items earmarked. {pending} still in the locker.",
  "notif.locker_visit.title": "{locker} visit overdue",
  "notif.locker_visit.body": "Last verified {days} days ago; interval is {interval} days.",
  "notif.missing_document.title": "{item} has no invoice",
  "notif.missing_document.body": "Add one to complete its record.",
  "notif.document_expiring.title": "{docType} expiring in {days} days",
  "notif.document_expiring.body": "{item} — {file}",

  // ---- Audit ----
  "audit.title": "Audit log",
  "audit.subtitle": "Append-only record of every change. Entries are never edited or removed.",
  "audit.empty": "No activity yet",
  // Action verbs, stored as keys on AuditEntry rather than as text.
  "audit.tookOut": "took out",
  "audit.returned": "returned",
  "audit.extendedDue": "extended the due date",
  "audit.startedTransfer": "started a transfer",
  "audit.confirmedArrival": "confirmed arrival",
  "audit.sentForService": "sent for service",
  "audit.collectedFromJeweler": "collected from the jeweler",
  "audit.markedLost": "marked as lost",
  "audit.addedItem": "added an item",
  "audit.editedItem": "edited an item",
  "audit.archivedItem": "archived an item",
  "audit.addedLocker": "added a locker",
  "audit.editedLocker": "edited a locker",
  "audit.verifiedLocker": "verified a locker",
  "audit.createdEvent": "created an event",
  "audit.editedEvent": "edited an event",
  "audit.invitedMember": "invited a member",
  "audit.deactivatedMember": "deactivated a member",
  "audit.updatedGoldRate": "updated the gold rate",
  "audit.updatedSettings": "updated settings",
  // Entity type chips
  "entity.jewelry": "jewelry",
  "entity.movement": "movement",
  "entity.locker": "locker",
  "entity.event": "event",
  "entity.user": "member",
  "entity.settings": "settings",

  // ---- Settings ----
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.languageDesc": "Applies to this device only",
  "settings.theme": "Appearance",
  "settings.themeDesc": "Applies to this device only",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.prices": "Show prices",
  "settings.pricesDesc": "Hidden everywhere by default",
  "settings.pricesToggle": "Show monetary values",
  "settings.pricesHint":
    "When off, no estimated value, purchase price or gold rate appears on any screen, and prices are left out of exports. Weights and counts are unaffected.",
  "settings.pricesOn": "Prices are visible across the app",
  "settings.pricesOff": "Prices are hidden across the app",
  "settings.goldRate": "Gold rate",
  "settings.goldRateUpdated": "Last updated {date}",
  "settings.ratePerGram": "Rate per gram (24K)",
  "settings.ratePerGramHint":
    "Maintained by hand for now; automatic rate fetching is a later enhancement.",
  "settings.vaultValue": "Vault value",
  "settings.atNewRate": "At new rate",
  "settings.updateRate": "Update rate",
  "settings.family": "Family",
  "settings.vaultName": "Vault name",
  "settings.dueSoonLead": "Warn me this many days before an item is due",
  "settings.export": "Export",
  "settings.exportDesc": "A nightly job writes the same JSON automatically once deployed.",
  "settings.downloadJson": "Download full backup (JSON)",
  "settings.downloadCsv": "Download inventory (CSV)",
  "settings.exportNote":
    "Keeping an off-platform copy is what makes the vault portable — you can move to any other provider with it.",
  "settings.prototype": "Prototype",
  "settings.prototypeDesc": "Not part of the finished app",
  "settings.signedInAs":
    "Data lives in this browser only. Signed in as {name} ({role}). Switch users from the sidebar to see role-dependent screens.",
  "settings.resetDemo": "Reset to sample data",
  "settings.resetTitle": "Reset to sample data?",
  "settings.resetBody":
    "Every change you have made in this browser will be discarded and the original sample data restored.",

  // ---- Login ----
  "login.tagline": "Private family vault — invite only",
  "login.email": "Email",
  "login.password": "Password",
  "login.signIn": "Sign in",
  "login.or": "or",
  "login.biometrics": "Unlock with biometrics",
  "login.noSignup":
    "There is no sign-up. An admin invites you by email, and you set your own password from that link.",

  // ---- Onboarding ----
  "onboarding.welcome": "Welcome",
  "onboarding.subtitle": "Three quick steps and you're set up.",
  "onboarding.step1Title": "Secure this device",
  "onboarding.step1Body": "Require Face ID, Touch ID, or your device PIN each time the vault is opened.",
  "onboarding.step1Cta": "Enable device lock",
  "onboarding.step2Title": "Add to your Home Screen",
  "onboarding.step2Body":
    "On iPhone: tap Share, then “Add to Home Screen.” This is required for notifications to work at all on iOS.",
  "onboarding.step2Cta": "I've added it",
  "onboarding.step3Title": "Turn on reminders",
  "onboarding.step3Body":
    "Get notified when an item is due back, when it becomes overdue, and before a family event.",
  "onboarding.step3Cta": "Allow notifications",
  "onboarding.openVault": "Open the vault",
  "onboarding.skip": "Skip for now",

  // ---- Vault key, unlock and recovery ----
  "vault.loading": "Opening the vault…",
  "vault.notConfiguredTitle": "Not connected",
  "vault.notConfiguredBody":
    "This build has no database configured. Set the Supabase URL and key in Cloudflare Pages, then redeploy.",

  "vault.setPasswordTitle": "Set your password",
  "vault.setPasswordBody":
    "This is how you sign in from now on. You will choose a separate passphrase next — that one decrypts the vault, and nobody can reset it for you.",
  "vault.passwordAgain": "Repeat password",
  "vault.passwordShort": "Use at least 8 characters",
  "vault.passwordMismatch": "The two passwords do not match",
  "vault.setPasswordCta": "Save password",

  "vault.createTitle": "Create your family vault",
  "vault.createBody":
    "This makes the key that encrypts everything in the vault. It is generated on this device and never sent to the server.",
  "vault.familyName": "Family name",
  "vault.yourName": "Your name",
  "vault.passphrase": "Passphrase",
  "vault.passphraseAgain": "Repeat passphrase",
  "vault.passphraseHelp":
    "Long, and used nowhere else. Nothing rate-limits an attack on this one, so length matters more than symbols.",
  "vault.passphraseShort": "Use at least 12 characters",
  "vault.passphraseMismatch": "The two passphrases do not match",
  "vault.createCta": "Create the vault",

  "vault.recoveryTitle": "Write this down now",
  "vault.recoveryBody":
    "The only way back in if everyone forgets their passphrase. It will not be shown again.",
  "vault.recoveryWhere":
    "Print it and keep it in the bank locker. Not in a photo, and not in a note on the phone that opens this app.",
  "vault.recoveryPrint": "Print",
  "vault.recoveryCopy": "Copy",
  "vault.recoveryCopied": "Copied",
  "vault.recoveryConfirm": "I have written it down and stored it safely",
  "vault.recoveryContinue": "Open the vault",

  "vault.unlockTitle": "Unlock",
  "vault.unlockBody": "Your PIN decrypts the vault on this device.",
  "vault.pinPrompt": "6-digit PIN",
  "vault.unlockCta": "Unlock",
  "vault.usePassphrase": "Use passphrase instead",
  "vault.usePin": "Use PIN instead",
  "vault.useRecovery": "Use the recovery key",
  "vault.recoveryPrompt": "Recovery key",
  "vault.wrongPin": "Wrong PIN",
  "vault.wrongPassphrase": "Wrong passphrase",
  "vault.deviceLocked": "Too many wrong PINs. Wait, or unlock with your passphrase.",

  "vault.enrolTitle": "Choose your passphrase",
  "vault.enrolBody":
    "This protects your personal key. An admin still has to let you into the vault afterwards.",
  "vault.enrolCta": "Save passphrase",

  "vault.awaitingTitle": "Waiting to be let in",
  "vault.awaitingBody":
    "Your key is registered. An admin has to admit you before anything is readable — the vault is not empty, and this is not an error.",
  "vault.awaitingRefresh": "Check again",

  "vault.pinTitle": "Set a PIN for this device",
  "vault.pinBody":
    "So you are not typing the passphrase every time. Five wrong PINs lock this device; ten remove it.",
  "vault.pinDeviceName": "Device name",
  "vault.pinDeviceNamePlaceholder": "Amma's phone",
  "vault.pinAgain": "Repeat PIN",
  "vault.pinMismatch": "The two PINs do not match",
  "vault.pinWeak": "Not a run of digits or six of the same one",
  "vault.pinCta": "Set PIN",
  "vault.pinSkip": "Not now",

  "vault.devices": "Your devices",
  "vault.deviceRemove": "Remove",
  "vault.deviceNever": "Never used",
  "vault.deviceLastUsed": "Last used {when}",
  "vault.deviceLockedUntil": "Locked until {when}",
  "vault.deviceNone": "No PIN set on any device yet.",

  "vault.lock": "Lock the vault",
  "vault.signOut": "Sign out",
  "vault.locked": "Locked",

  // ---- Badges ----
  "badge.overdueDays": "Overdue {n}d",
  "badge.due": "Due {when}",
} as const;

export type MessageKey = keyof typeof en;

/** Typed against `en`, so every key must be present and spelled correctly. */
const ta: Record<MessageKey, string> = {
  // ---- Navigation ----
  "nav.dashboard": "முகப்பு",
  "nav.home": "முகப்பு",
  "nav.jewelry": "நகைகள்",
  "nav.movements": "நகர்வுகள்",
  "nav.events": "நிகழ்வுகள்",
  "nav.lockers": "லாக்கர்கள்",
  "nav.members": "குடும்ப உறுப்பினர்கள்",
  "nav.documents": "ஆவணங்கள்",
  "nav.scan": "QR ஸ்கேன்",
  "nav.scanShort": "ஸ்கேன்",
  "nav.audit": "தணிக்கைப் பதிவு",
  "nav.settings": "அமைப்புகள்",
  "nav.notifications": "அறிவிப்புகள்",
  "nav.more": "மேலும்",
  "nav.viewingAs": "இவராகப் பார்க்கிறீர்கள் (மாதிரிக்கு மட்டும்)",
  "nav.close": "மூடு",

  // ---- Shared ----
  "common.add": "சேர்",
  "common.edit": "திருத்து",
  "common.save": "சேமி",
  "common.saveChanges": "மாற்றங்களைச் சேமி",
  "common.cancel": "ரத்து",
  "common.update": "புதுப்பி",
  "common.clear": "அழி",
  "common.selectAll": "அனைத்தையும் தேர்வுசெய்",
  "common.viewAll": "அனைத்தும்",
  "common.upload": "பதிவேற்று",
  "common.loading": "ஏற்றுகிறது…",
  "common.previous": "முந்தையது",
  "common.next": "அடுத்தது",
  "common.you": "நீங்கள்",
  "common.everyone": "அனைவரும்",
  "common.reset": "மீட்டமை",
  "common.remove": "நீக்கு",
  "common.notFound": "கிடைக்கவில்லை",
  "common.search": "தேடு",
  "common.reason": "காரணம்",
  "common.owner": "உரிமையாளர்",
  "common.status": "நிலை",
  "common.location": "இடம்",
  "common.none": "—",
  "common.unknown": "தெரியவில்லை",
  "common.open": "திறந்துள்ளது",
  "common.closed": "முடிந்தது",
  "common.items": "நகைகள்",
  "common.item": "நகை",

  // ---- Units and values ----
  "unit.gram": "கிராம்",
  "unit.purity": "{k} மாற்று",
  "unit.perGram": "{value}/கிராம்",

  // ---- Relative dates ----
  "date.today": "இன்று",
  "date.tomorrow": "நாளை",
  "date.yesterday": "நேற்று",
  "date.inDays": "{n} நாட்களில்",
  "date.daysAgo": "{n} நாட்களுக்கு முன்",

  // ---- Item status ----
  "status.in_locker": "லாக்கரில்",
  "status.with_member": "உறுப்பினரிடம்",
  "status.in_transit": "வழியில்",
  "status.at_jeweler": "நகைக்கடையில்",
  "status.lost": "தொலைந்தது",
  "status.any": "எல்லா நிலைகளும்",

  // ---- Categories ----
  "category.necklace": "மாலை",
  "category.bangle": "வளையல்",
  "category.ring": "மோதிரம்",
  "category.earring": "காதணி",
  "category.chain": "சங்கிலி",
  "category.bracelet": "கைவளை",
  "category.anklet": "கொலுசு",
  "category.coin": "நாணயம்",
  "category.other": "மற்றவை",
  "category.any": "எல்லா வகைகளும்",

  // ---- Movement types ----
  "movementType.takeout": "வெளியே எடுத்தது",
  "movementType.return": "திரும்ப வைத்தது",
  "movementType.transfer": "இடமாற்றம்",
  "movementType.service": "பழுதுபார்ப்பு",
  "movementType.lost": "தொலைந்தது",

  // ---- Dashboard ----
  "dashboard.goldRate": "தங்கம் விலை {rate} (24 மாற்று), {when} புதுப்பிக்கப்பட்டது.",
  "dashboard.overdueTitle": "{n} நகை(கள்) காலம் கடந்துவிட்டன",
  "dashboard.returnItems": "நகைகளைத் திரும்ப வை",
  "dashboard.totalItems": "மொத்த நகைகள்",
  "dashboard.archived": "{n} காப்பகத்தில்",
  "dashboard.netGold": "நிகர தங்கம்",
  "dashboard.excludingStones": "கற்கள் நீங்கலாக",
  "dashboard.estValue": "மதிப்பிடப்பட்ட மதிப்பு",
  "dashboard.atCurrentRate": "தற்போதைய விலையில்",
  "dashboard.outsideLocker": "லாக்கருக்கு வெளியே",
  "dashboard.secured": "{n} பாதுகாப்பாக",
  "dashboard.goldInLocker": "லாக்கரில் உள்ள தங்கம்",
  "dashboard.goldOutside": "வெளியே உள்ள தங்கம்",
  "dashboard.itemsInLocker": "{n} நகைகள்",
  "dashboard.splitSub": "{n} லாக்கரில் · {out} வெளியே",
  "dashboard.outOfLocker": "லாக்கருக்கு வெளியே உள்ளவை",
  "dashboard.awayCount": "{n} நகை(கள்) லாக்கருக்கு வெளியே",
  "dashboard.allSecured": "அனைத்தும் பாதுகாப்பாக உள்ளன",
  "dashboard.allSecuredDesc": "தற்போது எந்த நகையும் லாக்கருக்கு வெளியே இல்லை.",
  "dashboard.upcomingEvents": "வரவிருக்கும் நிகழ்வுகள்",
  "dashboard.noEvents": "அடுத்த 30 நாட்களில் நிகழ்வுகள் இல்லை",
  "dashboard.readyCount": "{ready}/{total} தயார்",
  "dashboard.needsAttention": "கவனம் தேவை",
  "dashboard.dueBackSoon": "விரைவில் திரும்ப வேண்டியவை",
  "dashboard.lockerVisitsDue": "லாக்கர் சரிபார்ப்பு நிலுவையில்",
  "dashboard.inTransitCount": "வழியில் உள்ள நகைகள்",
  "dashboard.atJewelerCount": "நகைக்கடையில் உள்ளவை",

  // ---- Jewelry list ----
  "jewelry.title": "நகைகள்",
  "jewelry.summary": "{count} நகை(கள்) · {weight} · {value}",
  "jewelry.searchPlaceholder": "பெயர், ஹால்மார்க், வைத்திருப்பவர், இடம் தேடுங்கள்…",
  "jewelry.filters": "வடிகட்டிகள்",
  "jewelry.anyone": "எவரும்",
  "jewelry.sortRecent": "புதியவை முதலில்",
  "jewelry.sortName": "பெயர் அ–ஃ",
  "jewelry.sortWeight": "அதிக எடை",
  "jewelry.sortValue": "அதிக மதிப்பு",
  "jewelry.noMatch": "பொருந்தும் நகைகள் இல்லை",
  "jewelry.noMatchDesc": "தேடலையோ வடிகட்டிகளையோ அழித்துப் பாருங்கள்.",
  "jewelry.addItem": "நகையைச் சேர்",

  // ---- Jewelry detail ----
  "item.notFound": "நகை கிடைக்கவில்லை",
  "item.notFoundDesc": "அது காப்பகப்படுத்தப்பட்டிருக்கலாம், அல்லது இணைப்பு பழையது.",
  "item.backToJewelry": "நகைகளுக்குத் திரும்பு",
  "item.estimatedFrom": "{weight} நிகர தங்கத்தின் தற்போதைய விலைப்படி மதிப்பிடப்பட்டது",
  "item.takeOut": "வெளியே எடு",
  "item.transfer": "இடமாற்று",
  "item.sendForService": "பழுதுபார்க்க அனுப்பு",
  "item.return": "திரும்ப வை",
  "item.extendDue": "திரும்பும் தேதியை நீட்டி",
  "item.confirmArrival": "{locker} இல் சேர்ந்ததை உறுதிசெய்",
  "item.collectFromJeweler": "நகைக்கடையிலிருந்து பெறு",
  "item.currentPosition": "தற்போதைய நிலை",
  "item.heldBy": "வைத்திருப்பவர்",
  "item.expectedBack": "திரும்ப வர வேண்டிய தேதி",
  "item.specification": "விவரக்குறிப்பு",
  "item.grossWeight": "மொத்த எடை",
  "item.netGoldWeight": "நிகர தங்க எடை",
  "item.stoneWeight": "கல் எடை",
  "item.purity": "மாற்று",
  "item.hallmark": "ஹால்மார்க்",
  "item.jeweler": "நகைக்கடை",
  "item.purchased": "வாங்கிய தேதி",
  "item.purchasePrice": "வாங்கிய விலை",
  "item.notes": "குறிப்புகள்",
  "item.documents": "ஆவணங்கள்",
  "item.documentsCount": "{n} ஆவணங்கள்",
  "item.noDocuments": "இதுவரை ஆவணங்கள் இல்லை",
  "item.noDocumentsDesc": "விலைப்பட்டியல், ஹால்மார்க் சான்றிதழ், காப்பீடு, உத்தரவாதம் ஆகியவை இங்கே.",
  "item.history": "வரலாறு",
  "item.historyDesc": "நகர்வுகள் நிரந்தரமானவை; திருத்தப்படுவதில்லை",
  "item.noMovements": "நகர்வுகள் பதிவாகவில்லை",
  "item.closedOn": "{when} முடிந்தது",
  "item.label": "லேபிள்",
  "item.labelDesc": "நிலையான ID — லேபிள்களை மீண்டும் அச்சிட வேண்டியதில்லை",
  "item.labelHint":
    "இதை அச்சிட்டு பொருளுடன் வையுங்கள். எந்தத் தொலைபேசி கேமராவும் பெட்டகத்தை இங்கே திறக்கும்.",
  "item.printLabel": "லேபிளை அச்சிடு",
  "item.downloadLabel": "பதிவிறக்கு",
  "item.openScanner": "ஸ்கேனரைத் திற",
  "item.archive": "நகையைக் காப்பகப்படுத்து",
  "item.archiveConfirm": "இந்த நகையைக் காப்பகப்படுத்தலாமா?",
  "item.archiveBody":
    "காப்பகப்படுத்தினால் {name} பட்டியலில் இருந்து மறையும், ஆனால் அதன் முழு வரலாறும் இருக்கும். எதுவும் நீக்கப்படுவதில்லை.",
  "item.serviceTitle": "பழுதுபார்க்க அனுப்பு",
  "item.serviceShop": "நகைக்கடை",
  "item.serviceShopPlaceholder": "கடையின் பெயர்",
  "item.serviceReasonPlaceholder": "அளவு மாற்றம், பாலிஷ், கொக்கி சரிசெய்தல்…",
  "item.expectedBackLabel": "திரும்ப வர வேண்டிய தேதி",
  "item.send": "அனுப்பு",
  "item.collectTitle": "நகைக்கடையிலிருந்து பெறு",
  "item.collectBody": "எந்த லாக்கரில் வைக்கப் போகிறீர்கள்?",
  "item.extendTitle": "திரும்பும் தேதியை நீட்டி",
  "item.extendBody":
    "தற்போது {date} அன்று திரும்ப வேண்டும். இந்த மாற்றம் தணிக்கைப் பதிவில் சேரும், எனவே முதலில் கொடுத்த தேதி மறையாது.",
  "item.newReturnDate": "புதிய திரும்பும் தேதி",
  "item.extend": "நீட்டி",
  "item.by": "—",

  // ---- Add / edit ----
  "edit.addTitle": "நகை சேர்",
  "edit.editTitle": "நகையைத் திருத்து",
  "edit.photos": "புகைப்படங்கள்",
  "edit.photosDesc": "இலவச சேமிப்பில் அடங்க பதிவேற்றும்போது சுருக்கப்படும்",
  "edit.addPhoto": "படம் சேர்",
  "edit.photosNote":
    "பதிவேற்றுவதற்கு முன் புகைப்படங்கள் உலாவியிலேயே சுமார் 400 KB அளவுக்குச் சுருக்கப்படும் — இலவசத் திட்டத்தில் ~600 படங்களா அல்லது ~80 படங்களா என்பதை இதுவே தீர்மானிக்கிறது. இருப்பிடத் தகவலும் நீக்கப்படும்.",
  "edit.uploading": "மறையாக்கப்படுகிறது…",
  "edit.removePhoto": "படத்தை நீக்கு",
  "edit.compressed": "{from} → {to}",
  "members.pendingTitle": "அனுமதிக்காகக் காத்திருப்பவர்கள்",
  "members.pendingBody":
    "அவர்கள் உள்நுழைந்து கடவுத்தொடரை அமைத்துவிட்டார்கள். நீங்கள் அனுமதித்தால் பெட்டகத்தை மறைநீக்கும் விசை அவர்களுக்குக் கிடைக்கும் — அது உங்கள் சாதனத்திலேயே நடக்கிறது.",
  "members.admit": "அனுமதி",
  "members.notSignedIn": "இன்னும் உள்நுழையவில்லை",
  "members.notAdmitted": "இன்னும் பெட்டகத்தைப் பார்க்க முடியாது",
  "members.inviteThenAdmit":
    "கடவுச்சொல் அமைக்க அவர்களுக்கு மின்னஞ்சல் செல்லும். அவர்கள் உள்நுழைந்து கடவுத்தொடரைத் தேர்ந்தெடுத்த பிறகு இங்கே வந்து அனுமதியுங்கள் — அதுவரை அவர்களுக்கு எதுவும் தெரியாது.",
  "settings.storage": "படச் சேமிப்பு",
  "settings.storageDesc": "Supabase 1 GB இலவசமாகத் தருகிறது",
  "settings.storageUsed": "{total}-இல் {used}",
  "settings.storagePhotos": "{items} பொருட்களில் {n} படங்கள்",
  "settings.storageRoom": "இதே அளவில் இன்னும் சுமார் {n} படங்களுக்கு இடம் உள்ளது",
  "edit.basics": "அடிப்படை விவரங்கள்",
  "edit.scanInvoice": "விலைப்பட்டியலை ஸ்கேன் செய்",
  "edit.name": "பெயர்",
  "edit.namePlaceholder": "கோயில் வேலைப்பாடு அரம்",
  "edit.category": "வகை",
  "edit.customCategory": "வகையின் பெயர்",
  "edit.customCategoryHint": "இந்த நகை எப்படி அழைக்கப்படுகிறதோ அதைத் தட்டச்சு செய்யுங்கள்",
  "edit.customCategoryPlaceholder": "ஒட்டியாணம், வாங்கி, மூக்குத்தி…",
  "edit.ownerHint": "யாருக்குச் சொந்தம் என்பது; அணிபவர் அல்ல",
  "edit.storedIn": "எங்கு வைக்கப்பட்டுள்ளது",
  "edit.notesPlaceholder": "கையாளும் முறை, எந்தச் செட்டைச் சேர்ந்தது…",
  "edit.weightPurity": "எடையும் மாற்றும்",
  "edit.grossWeightG": "மொத்த எடை (கிராம்)",
  "edit.stoneWeightG": "கல் எடை (கிராம்)",
  "edit.netGoldWeightG": "நிகர தங்க எடை (கிராம்)",
  "edit.netGoldHint": "மதிப்புக் கணக்கிட பயன்படும்",
  "edit.purityK": "மாற்று",
  "edit.provenance": "வாங்கிய விவரம்",
  "edit.hallmarkNo": "ஹால்மார்க் எண்",
  "edit.purchaseDate": "வாங்கிய தேதி",
  "edit.scannedNote":
    "தனிப்படுத்திக் காட்டப்பட்ட புலங்கள் ஸ்கேன் செய்த விலைப்பட்டியலிலிருந்து வந்தவை — சேமிக்கும் முன் சரிபாருங்கள்.",
  "edit.addAction": "நகையைச் சேர்",

  // ---- Movements ----
  "movements.title": "நகர்வுகள்",
  "movements.subtitle":
    "ஒவ்வொரு நகர்வும் நிரந்தரம் — பதிவுகள் முடிக்கப்படும், திருத்தவோ நீக்கவோ முடியாது.",
  "movements.currentlyOut": "தற்போது வெளியே ({n})",
  "movements.history": "வரலாறு ({n})",
  "movements.nothingOut": "எதுவும் வெளியே இல்லை",
  "movements.nothingOutDesc": "அனைத்து நகைகளும் லாக்கரில் உள்ளன.",
  "movements.noDueDate": "தேதி இல்லை",
  "movements.due": "{date} அன்று",
  "movements.confirmArrival": "வந்ததை உறுதிசெய்",
  "movements.allMovements": "அனைத்து நகர்வுகளும்",
  "movements.archivedItem": "காப்பகப்படுத்திய நகை",

  // ---- Take out ----
  "takeout.title": "வெளியே எடு",
  "takeout.selectItems": "நகைகளைத் தேர்வுசெய்",
  "takeout.selectedOf": "{total} இல் {selected} தேர்வு",
  "takeout.nothingAvailable": "எதுவும் இல்லை",
  "takeout.nothingAvailableDesc": "லாக்கரில் உள்ள நகைகளை மட்டுமே வெளியே எடுக்க முடியும்.",
  "takeout.details": "விவரங்கள்",
  "takeout.whoIsTaking": "யார் எடுத்துச் செல்கிறார்",
  "takeout.forEvent": "நிகழ்வுக்காகவா?",
  "takeout.forEventHint": "நிகழ்வு முடிந்த மறுநாளைத் திரும்பும் தேதியாக அமைக்கும்",
  "takeout.notForEvent": "நிகழ்வுக்கு அல்ல",
  "takeout.reasonPlaceholder": "திருமணம், தினசரி அணிதல், புகைப்படம்…",
  "takeout.expectedReturn": "திரும்ப வர வேண்டிய தேதி",
  "takeout.reminderNote":
    "இந்த நகைகள் திரும்ப வேண்டிய நாள் ({date}) காலையில் நினைவூட்டல் வரும்; காலம் கடந்த ஒவ்வொரு நாளும் மீண்டும் வரும்.",
  "takeout.action": "{n} நகை(கள்) வெளியே எடு",

  // ---- Return ----
  "return.title": "நகைகளைத் திரும்ப வை",
  "return.subtitle":
    "உண்மையில் திரும்பி வருபவற்றை மட்டும் தேர்வுசெய்யுங்கள் — 5 இல் 3 திரும்புவது இயல்பு; மீதியவை வெளியேயே இருக்கும்.",
  "return.currentlyOut": "தற்போது வெளியே",
  "return.nothingToReturn": "திரும்ப வைக்க எதுவும் இல்லை",
  "return.nothingToReturnDesc": "எந்த நகையும் உறுப்பினரிடம் இல்லை.",
  "return.destination": "எங்கு வைக்கப்படும்",
  "return.locker": "லாக்கர்",
  "return.visitNote":
    "திரும்ப வைப்பது அந்த லாக்கருக்கான வருகையையும் பதிவுசெய்யும், அதன் சரிபார்ப்பு நினைவூட்டல் மீட்டமையும்.",
  "return.action": "{n} நகை(கள்) திரும்ப வை",

  // ---- Transfer ----
  "transfer.title": "லாக்கர்களுக்கு இடையே மாற்று",
  "transfer.subtitle":
    "நகைகள் “வழியில்” என்ற நிலை வழியாகச் செல்கின்றன, எனவே இடமாற்றத்தின் நடுவே அவை மறைவதில்லை. நேரில் வைத்தபின் சேர்ந்ததை உறுதிசெய்யுங்கள்.",
  "transfer.inTransitCount": "{n} நகை(கள்) வழியில்",
  "transfer.confirmAll": "அனைத்தையும் உறுதிசெய்",
  "transfer.arrivedAt": "{locker} இல் சேர்ந்தது",
  "transfer.selectItems": "நகைகளைத் தேர்வுசெய்",
  "transfer.selectedCount": "{n} தேர்வு",
  "transfer.fromAny": "எந்த லாக்கரிலிருந்தும்",
  "transfer.fromLocker": "{locker} இலிருந்து",
  "transfer.noneAvailable": "நகைகள் எதுவும் இல்லை",
  "transfer.noneAvailableDesc": "வேறு லாக்கரை அல்லது வேறு இலக்கைத் தேர்வுசெய்யுங்கள்.",
  "transfer.destination": "இலக்கு",
  "transfer.moveTo": "எங்கு மாற்ற",
  "transfer.reasonPlaceholder": "மணமகள் செட்டை ஒன்றாக்குதல்…",
  "transfer.start": "இடமாற்றத்தைத் தொடங்கு",

  // ---- Lockers ----
  "lockers.title": "லாக்கர்கள்",
  "lockers.subtitle": "{count} இடங்கள் · {items} நகைகள் பாதுகாப்பாக",
  "lockers.items": "நகைகள்",
  "lockers.gross": "மொத்த எடை",
  "lockers.value": "மதிப்பு",
  "lockers.shareOfVault": "பெட்டகத்தில் பங்கு",
  "lockers.visitOverdue": "சரிபார்ப்பு தாமதம்",
  "lockers.verified": "சரிபார்க்கப்பட்டது",
  "lockers.neverVisited": "இதுவரை சென்றதில்லை",
  "lockers.visitInterval": "{days} நாட்களுக்கு முன் · ஒவ்வொரு {interval} நாட்களுக்கும்",
  "lockers.verifyNow": "இப்போது சரிபார்",
  "lockers.keyHolder": "சாவி வைத்திருப்பவர்: {name}",
  "lockers.unassigned": "ஒதுக்கப்படவில்லை",
  "lockers.viewContents": "உள்ளடக்கத்தைப் பார்",
  "lockers.addTitle": "லாக்கர் சேர்",
  "lockers.editTitle": "லாக்கரைத் திருத்து",
  "lockers.name": "பெயர்",
  "lockers.namePlaceholder": "SBI லாக்கர்",
  "lockers.type": "வகை",
  "lockers.typeBank": "வங்கி லாக்கர்",
  "lockers.typeHome": "வீட்டுப் பெட்டகம்",
  "lockers.keyHolderLabel": "சாவி வைத்திருப்பவர்",
  "lockers.branch": "கிளை",
  "lockers.number": "லாக்கர் எண்",
  "lockers.verifyEvery": "எத்தனை நாட்களுக்கு ஒருமுறை சரிபார்க்க",
  "lockers.verifyEveryHint": "லாக்கர் வருகை நினைவூட்டலை இது தீர்மானிக்கிறது",

  // ---- Events ----
  "events.title": "நிகழ்வுகள்",
  "events.subtitle":
    "ஒரு நிகழ்வுடன் நகைகளை இணையுங்கள், பிறகு அனைத்தையும் ஒரே கட்டத்தில் வெளியே எடுங்கள்.",
  "events.noUpcoming": "வரவிருக்கும் நிகழ்வுகள் இல்லை",
  "events.noUpcomingDesc":
    "எந்த நகைகள் தேவை, எப்போது திரும்பும் என்பதைத் திட்டமிட ஒரு நிகழ்வை உருவாக்குங்கள்.",
  "events.past": "கடந்த நிகழ்வுகள்",
  "events.itemsReady": "தயாரான நகைகள்",
  "events.newTitle": "புதிய நிகழ்வு",
  "events.editTitle": "நிகழ்வைத் திருத்து",
  "events.name": "பெயர்",
  "events.namePlaceholder": "ரம்யா திருமணம்",
  "events.starts": "தொடக்கம்",
  "events.ends": "முடிவு",
  "events.location": "இடம்",
  "events.notes": "குறிப்புகள்",

  // ---- Event detail ----
  "event.notFound": "நிகழ்வு கிடைக்கவில்லை",
  "event.backToEvents": "நிகழ்வுகளுக்குத் திரும்பு",
  "event.collected": "{total} இல் {collected} நகைகள் எடுக்கப்பட்டன",
  "event.stillInLocker": "{n} இன்னும் லாக்கரில். எடுத்தால் {date} அன்று திரும்ப வேண்டும்.",
  "event.allOut": "இந்த நிகழ்வுக்கான அனைத்தும் லாக்கருக்கு வெளியே உள்ளன.",
  "event.takeOutN": "{n} வெளியே எடு",
  "event.returnAll": "அனைத்தையும் திரும்ப வை",
  "event.attached": "இணைக்கப்பட்ட நகைகள்",
  "event.attachedCount": "{n} நகை(கள்)",
  "event.nothingAttached": "இதுவரை எதுவும் இணைக்கப்படவில்லை",
  "event.nothingAttachedDesc": "இந்த நிகழ்வுக்குத் தேவையான நகைகளைத் தேர்வுசெய்யுங்கள்.",
  "event.attach": "இணை",
  "event.attachJewelry": "நகைகளை இணை",
  "event.filterByOwner": "உரிமையாளர் வாரியாக வடிகட்டு",
  "event.ownerAll": "அனைத்து உரிமையாளர்களும்",
  "event.noneMatchOwner": "தேர்ந்தெடுத்த உரிமையாளர்களுக்கு நகைகள் இல்லை",
  "event.returnAllTitle": "நிகழ்வின் அனைத்து நகைகளையும் திரும்ப வை",
  "event.returnAllBody": "{n} நகை(கள்) திரும்புகின்றன. எந்த லாக்கரில் வைக்கப் போகிறீர்கள்?",
  "event.saveN": "{n} நகை(கள்) சேமி",

  // ---- Members ----
  "members.title": "குடும்ப உறுப்பினர்கள்",
  "members.subtitle": "{n} செயலில்",
  "members.invite": "அழை",
  "members.inviteOnly":
    "இந்தப் பெட்டகம் அழைப்பின் பேரில் மட்டுமே. புதிய உறுப்பினர்களுக்கு மின்னஞ்சல் அழைப்பு செல்லும், அவர்களே கடவுச்சொல்லை அமைப்பார்கள் — பொதுப் பதிவுப் பக்கம் இல்லை.",
  "members.owns": "சொந்தம்",
  "members.holding": "வைத்துள்ளார்",
  "members.ownedValue": "சொந்த மதிப்பு",
  "members.currentlyHolding": "தற்போது வைத்திருப்பவை",
  "members.deactivate": "செயலிழக்கச் செய்",
  "members.reactivate": "மீண்டும் இயக்கு",
  "members.inactive": "செயலில் இல்லை",
  "members.inviteTitle": "குடும்ப உறுப்பினரை அழை",
  "members.name": "பெயர்",
  "members.namePlaceholder": "பிரியா",
  "members.email": "மின்னஞ்சல்",
  "members.emailHint": "கடவுச்சொல்லை அமைக்க இணைப்பு அவர்களுக்குச் செல்லும்",
  "members.role": "பங்கு",
  "members.roleHint":
    "நிர்வாகிகள் நகைகளைச் சேர்க்கலாம், லாக்கர்களை அமைக்கலாம், மற்றவர்களை அழைக்கலாம்",
  "members.roleAdmin": "நிர்வாகி",
  "members.roleMember": "உறுப்பினர்",
  "members.sendInvite": "அழைப்பு அனுப்பு",

  // ---- Documents ----
  "documents.title": "ஆவணங்கள்",
  "documents.subtitle": "{items} நகைகளுக்கு {files} கோப்புகள்",
  "documents.expiringTitle": "{n} ஆவணம்(ங்கள்) 60 நாட்களுக்குள் காலாவதியாகின்றன",
  "documents.expiresOn": "{date} அன்று காலாவதி",
  "documents.missingTitle": "விலைப்பட்டியல் இல்லை",
  "documents.missingDesc": "{n} நகை(களுக்கு) விலைப்பட்டியல் இல்லை",
  "documents.allTypes": "எல்லா ஆவண வகைகளும்",
  "documents.none": "ஆவணங்கள் இல்லை",
  "documents.noneDesc": "விலைப்பட்டியல்கள், சான்றிதழ்களை இங்கே பதிவேற்றுங்கள்.",
  "documents.archivedItem": "காப்பகப்படுத்திய நகை",
  "docType.invoice": "விலைப்பட்டியல்",
  "docType.hallmark": "ஹால்மார்க் சான்றிதழ்",
  "docType.insurance": "காப்பீடு",
  "docType.warranty": "உத்தரவாதம்",
  "docType.other": "மற்றவை",

  // ---- Scan ----
  "scan.title": "ஸ்கேன்",
  "scan.subtitle":
    "ஒவ்வொரு நகைக்கும் நிலையான ID உள்ளது, எனவே அச்சிட்ட லேபிள்களை மீண்டும் அச்சிட வேண்டியதில்லை.",
  "scan.modeLookup": "நகையைத் தேடு",
  "scan.modeVerify": "லாக்கரைச் சரிபார்",
  "scan.cameraNote":
    "லாக்கரை எண்ணிச் சரிபார்க்க. ஒரு பொருளைத் திறக்க, உங்கள் தொலைபேசியின் கேமரா செயலியே இந்த லேபிள்களைப் படிக்கும்.",
  "scan.startCamera": "கேமராவைத் தொடங்கு",
  "scan.stopCamera": "நிறுத்து",
  "scan.pointAtLabel": "லேபிளில் காட்டுங்கள்",
  "scan.cameraDenied":
    "கேமரா அனுமதி இல்லை. உலாவி அமைப்புகளில் அனுமதியுங்கள், அல்லது கீழே பொருளின் ID-ஐத் தட்டச்சு செய்யுங்கள்.",
  "scan.enterId": "பொருளின் ID",
  "scan.enterIdPlaceholder": "இணைப்பையோ பொருளின் ID-யையோ ஒட்டுங்கள்",
  "scan.lookUp": "தேடு",
  "scan.unknownCode": "இந்தக் குறியீடு இந்தப் பெட்டகத்தில் எதனுடனும் பொருந்தவில்லை.",
  "scan.scanned": "ஸ்கேன் செய்யப்பட்டது",
  "scan.nothingScanned": "இதுவரை எதுவும் ஸ்கேன் செய்யப்படவில்லை",
  "scan.nothingScannedDesc": "கேமராவைத் தொடங்குங்கள், அல்லது மேலே பொருளின் ID-ஐத் தட்டச்சு செய்யுங்கள்.",
  "scan.openDetails": "விவரங்களைத் திற",
  "scan.verification": "லாக்கர் சரிபார்ப்பு",
  "scan.confirmedOf": "{total} இல் {seen} உறுதி",
  "scan.emptyLocker": "இந்த லாக்கர் காலியாக உள்ளது",
  "scan.allAccounted": "{n} நகைகளும் கணக்கில் உள்ளன",
  "scan.recordVisit": "வருகையைப் பதிவுசெய்",
  "scan.notScanned": "{n} இன்னும் ஸ்கேன் ஆகவில்லை",
  "scan.keepScanning": "தொடர்ந்து ஸ்கேன் செய்யுங்கள், கிடைக்காதவற்றை விசாரியுங்கள்: {names}.",

  // ---- Notifications ----
  "notifications.title": "அறிவிப்புகள்",
  "notifications.unread": "{n} படிக்கப்படாதவை",
  "notifications.allCaughtUp": "அனைத்தும் பார்க்கப்பட்டன",
  "notifications.markAllRead": "அனைத்தையும் படித்ததாகக் குறி",
  "notifications.pushTitle": "புஷ் அறிவிப்புகளை இயக்குங்கள்",
  "notifications.pushBody":
    "ஐபோனில், முதலில் இந்த ஆப்-ஐ முகப்புத் திரையில் சேர்க்க வேண்டும் — நிறுவப்பட்ட ஆப்களுக்கு மட்டுமே சஃபாரி புஷ் அனுப்பும். பிறகு கேட்கும்போது அறிவிப்புகளை அனுமதியுங்கள்.",
  "notifications.enable": "அறிவிப்புகளை இயக்கு",
  "notifications.empty": "தெரிவிக்க எதுவும் இல்லை",
  "notifications.emptyDesc":
    "காலம் கடந்த நகைகள், நிகழ்வுகள், லாக்கர் வருகைகள் பற்றிய நினைவூட்டல்கள் இங்கே தோன்றும்.",
  "notifications.footer":
    "நினைவூட்டல்களை இந்த ஆப் அல்ல, திட்டமிடப்பட்ட Cloudflare Worker அனுப்புகிறது — எனவே யாரும் ஆப்-ஐத் திறக்காவிட்டாலும் அவை வந்துசேரும்.",
  "notifKind.overdue": "காலம் கடந்தது",
  "notifKind.due_soon": "விரைவில்",
  "notifKind.event_upcoming": "நிகழ்வு",
  "notifKind.locker_visit": "லாக்கர்",
  "notifKind.missing_document": "ஆவணம்",
  "notifKind.document_expiring": "ஆவணம்",

  "notif.overdue.title": "{item} — காலம் கடந்தது",
  "notif.overdue.body": "{holder} இடம் உள்ளது; {days} நாளுக்கு முன்பே திரும்ப வேண்டியது.",
  "notif.due_soon.title": "{item} இன்னும் {days} நாளில் திரும்ப வேண்டும்",
  "notif.due_soon.body": "{holder} இடம் உள்ளது.",
  "notif.event_upcoming.title": "{event} இன்னும் {days} நாளில் தொடங்குகிறது",
  "notif.event_upcoming.body": "{total} நகைகள் ஒதுக்கப்பட்டுள்ளன. {pending} இன்னும் லாக்கரில்.",
  "notif.locker_visit.title": "{locker} சரிபார்ப்பு தாமதம்",
  "notif.locker_visit.body":
    "கடைசியாக {days} நாட்களுக்கு முன் சரிபார்க்கப்பட்டது; இடைவெளி {interval} நாட்கள்.",
  "notif.missing_document.title": "{item} — விலைப்பட்டியல் இல்லை",
  "notif.missing_document.body": "பதிவை முழுமையாக்க ஒன்றைச் சேர்க்கவும்.",
  "notif.document_expiring.title": "{docType} இன்னும் {days} நாட்களில் காலாவதி",
  "notif.document_expiring.body": "{item} — {file}",

  // ---- Audit ----
  "audit.title": "தணிக்கைப் பதிவு",
  "audit.subtitle":
    "ஒவ்வொரு மாற்றத்தின் பதிவு; சேர்க்க மட்டுமே முடியும். பதிவுகள் திருத்தவோ நீக்கவோ படுவதில்லை.",
  "audit.empty": "இதுவரை செயல்பாடு இல்லை",
  "audit.tookOut": "வெளியே எடுத்தார்",
  "audit.returned": "திரும்ப வைத்தார்",
  "audit.extendedDue": "திரும்பும் தேதியை நீட்டித்தார்",
  "audit.startedTransfer": "இடமாற்றத்தைத் தொடங்கினார்",
  "audit.confirmedArrival": "வந்ததை உறுதிசெய்தார்",
  "audit.sentForService": "பழுதுபார்க்க அனுப்பினார்",
  "audit.collectedFromJeweler": "நகைக்கடையிலிருந்து பெற்றார்",
  "audit.markedLost": "தொலைந்ததாகக் குறித்தார்",
  "audit.addedItem": "நகையைச் சேர்த்தார்",
  "audit.editedItem": "நகையைத் திருத்தினார்",
  "audit.archivedItem": "நகையைக் காப்பகப்படுத்தினார்",
  "audit.addedLocker": "லாக்கரைச் சேர்த்தார்",
  "audit.editedLocker": "லாக்கரைத் திருத்தினார்",
  "audit.verifiedLocker": "லாக்கரைச் சரிபார்த்தார்",
  "audit.createdEvent": "நிகழ்வை உருவாக்கினார்",
  "audit.editedEvent": "நிகழ்வைத் திருத்தினார்",
  "audit.invitedMember": "உறுப்பினரை அழைத்தார்",
  "audit.deactivatedMember": "உறுப்பினரைச் செயலிழக்கச் செய்தார்",
  "audit.updatedGoldRate": "தங்கம் விலையைப் புதுப்பித்தார்",
  "audit.updatedSettings": "அமைப்புகளைப் புதுப்பித்தார்",
  "entity.jewelry": "நகை",
  "entity.movement": "நகர்வு",
  "entity.locker": "லாக்கர்",
  "entity.event": "நிகழ்வு",
  "entity.user": "உறுப்பினர்",
  "entity.settings": "அமைப்புகள்",

  // ---- Settings ----
  "settings.title": "அமைப்புகள்",
  "settings.language": "மொழி",
  "settings.languageDesc": "இந்தச் சாதனத்திற்கு மட்டும் பொருந்தும்",
  "settings.theme": "தோற்றம்",
  "settings.themeDesc": "இந்தச் சாதனத்திற்கு மட்டும் பொருந்தும்",
  "settings.themeSystem": "சாதன அமைப்பு",
  "settings.themeLight": "வெளிச்சம்",
  "settings.themeDark": "இருள்",
  "settings.prices": "விலைகளைக் காட்டு",
  "settings.pricesDesc": "இயல்பாக எங்கும் மறைக்கப்பட்டிருக்கும்",
  "settings.pricesToggle": "பண மதிப்புகளைக் காட்டு",
  "settings.pricesHint":
    "அணைத்திருக்கும்போது, மதிப்பீடு, வாங்கிய விலை, தங்கம் விலை எதுவும் எந்தத் திரையிலும் தெரியாது; ஏற்றுமதியிலும் சேராது. எடையும் எண்ணிக்கையும் பாதிக்கப்படாது.",
  "settings.pricesOn": "விலைகள் ஆப் முழுவதும் தெரியும்",
  "settings.pricesOff": "விலைகள் ஆப் முழுவதும் மறைக்கப்பட்டுள்ளன",
  "settings.goldRate": "தங்கம் விலை",
  "settings.goldRateUpdated": "கடைசியாக {date} அன்று புதுப்பிக்கப்பட்டது",
  "settings.ratePerGram": "ஒரு கிராம் விலை (24 மாற்று)",
  "settings.ratePerGramHint":
    "தற்போது கையால் பராமரிக்கப்படுகிறது; தானாக விலை பெறுவது பிற்பாடு சேர்க்கப்படும்.",
  "settings.vaultValue": "பெட்டக மதிப்பு",
  "settings.atNewRate": "புதிய விலையில்",
  "settings.updateRate": "விலையைப் புதுப்பி",
  "settings.family": "குடும்பம்",
  "settings.vaultName": "பெட்டகத்தின் பெயர்",
  "settings.dueSoonLead": "நகை திரும்ப வேண்டிய தேதிக்கு எத்தனை நாட்கள் முன் எச்சரிக்க",
  "settings.export": "ஏற்றுமதி",
  "settings.exportDesc": "பயன்பாட்டில் சேர்த்தபின், இதே JSON ஒவ்வொரு இரவும் தானாகச் சேமிக்கப்படும்.",
  "settings.downloadJson": "முழு காப்புப்பிரதி (JSON) பதிவிறக்கு",
  "settings.downloadCsv": "நகைப் பட்டியல் (CSV) பதிவிறக்கு",
  "settings.exportNote":
    "வெளியே ஒரு நகலை வைத்திருப்பதே பெட்டகத்தை நகர்த்தக்கூடியதாக ஆக்குகிறது — வேறு எந்த சேவைக்கும் மாறலாம்.",
  "settings.prototype": "மாதிரி",
  "settings.prototypeDesc": "இறுதி ஆப்-இல் இது இருக்காது",
  "settings.signedInAs":
    "தரவு இந்த உலாவியில் மட்டுமே உள்ளது. {name} ({role}) ஆக உள்நுழைந்துள்ளீர்கள். பங்குக்கேற்ற திரைகளைப் பார்க்க பக்கப் பட்டியில் பயனரை மாற்றுங்கள்.",
  "settings.resetDemo": "மாதிரித் தரவுக்கு மீட்டமை",
  "settings.resetTitle": "மாதிரித் தரவுக்கு மீட்டமைக்கவா?",
  "settings.resetBody":
    "இந்த உலாவியில் நீங்கள் செய்த அனைத்து மாற்றங்களும் நீக்கப்பட்டு, அசல் மாதிரித் தரவு மீட்கப்படும்.",

  // ---- Login ----
  "login.tagline": "தனிப்பட்ட குடும்பப் பெட்டகம் — அழைப்பின் பேரில் மட்டும்",
  "login.email": "மின்னஞ்சல்",
  "login.password": "கடவுச்சொல்",
  "login.signIn": "உள்நுழை",
  "login.or": "அல்லது",
  "login.biometrics": "கைரேகை / முகம் மூலம் திற",
  "login.noSignup":
    "பதிவு செய்யும் வசதி இல்லை. நிர்வாகி மின்னஞ்சல் மூலம் அழைப்பார், அந்த இணைப்பிலிருந்து நீங்களே கடவுச்சொல்லை அமைப்பீர்கள்.",

  // ---- Onboarding ----
  "onboarding.welcome": "வரவேற்கிறோம்",
  "onboarding.subtitle": "மூன்று சிறிய படிகள், நீங்கள் தயார்.",
  "onboarding.step1Title": "இந்தச் சாதனத்தைப் பாதுகாக்கவும்",
  "onboarding.step1Body":
    "பெட்டகத்தைத் திறக்கும் ஒவ்வொரு முறையும் Face ID, Touch ID அல்லது சாதன PIN கேட்கும்படி அமைக்கவும்.",
  "onboarding.step1Cta": "சாதனப் பூட்டை இயக்கு",
  "onboarding.step2Title": "முகப்புத் திரையில் சேர்க்கவும்",
  "onboarding.step2Body":
    "ஐபோனில்: Share தட்டி, “Add to Home Screen” தேர்வுசெய்யுங்கள். iOS-இல் அறிவிப்புகள் வேலை செய்ய இது கட்டாயம்.",
  "onboarding.step2Cta": "சேர்த்துவிட்டேன்",
  "onboarding.step3Title": "நினைவூட்டல்களை இயக்கவும்",
  "onboarding.step3Body":
    "நகை திரும்ப வேண்டிய நேரம், காலம் கடக்கும்போது, குடும்ப நிகழ்வுக்கு முன் அறிவிப்பு வரும்.",
  "onboarding.step3Cta": "அறிவிப்புகளை அனுமதி",
  "onboarding.openVault": "பெட்டகத்தைத் திற",
  "onboarding.skip": "இப்போதைக்குத் தவிர்",

  // ---- Vault key, unlock and recovery ----
  "vault.loading": "பெட்டகம் திறக்கப்படுகிறது…",
  "vault.notConfiguredTitle": "இணைப்பு இல்லை",
  "vault.notConfiguredBody":
    "இந்தப் பதிப்புக்கு தரவுத்தளம் அமைக்கப்படவில்லை. Cloudflare Pages-இல் Supabase URL மற்றும் விசையை அமைத்து மீண்டும் வெளியிடுங்கள்.",

  "vault.setPasswordTitle": "உங்கள் கடவுச்சொல்லை அமைக்கவும்",
  "vault.setPasswordBody":
    "இனிமேல் இதைக் கொண்டுதான் உள்நுழைவீர்கள். அடுத்து தனியாக ஒரு கடவுத்தொடர் தேர்ந்தெடுப்பீர்கள் — அதுதான் பெட்டகத்தை மறைநீக்கும், அதை யாராலும் மீட்டமைக்க முடியாது.",
  "vault.passwordAgain": "கடவுச்சொல்லை மீண்டும் உள்ளிடுங்கள்",
  "vault.passwordShort": "குறைந்தது 8 எழுத்துகள் வேண்டும்",
  "vault.passwordMismatch": "இரண்டு கடவுச்சொற்களும் ஒன்றல்ல",
  "vault.setPasswordCta": "கடவுச்சொல்லைச் சேமி",

  "vault.createTitle": "உங்கள் குடும்பப் பெட்டகத்தை உருவாக்குங்கள்",
  "vault.createBody":
    "பெட்டகத்தில் உள்ள அனைத்தையும் மறையாக்கும் விசை இப்போது உருவாகும். இது இந்தச் சாதனத்திலேயே உருவாகிறது, சேவையகத்திற்கு ஒருபோதும் அனுப்பப்படுவதில்லை.",
  "vault.familyName": "குடும்பப் பெயர்",
  "vault.yourName": "உங்கள் பெயர்",
  "vault.passphrase": "கடவுத்தொடர்",
  "vault.passphraseAgain": "கடவுத்தொடரை மீண்டும் உள்ளிடுங்கள்",
  "vault.passphraseHelp":
    "நீளமாகவும், வேறு எங்கும் பயன்படுத்தாததாகவும் இருக்கட்டும். இதைத் தாக்குபவரை எதுவும் தடுப்பதில்லை, எனவே சிறப்பு எழுத்துகளை விட நீளமே முக்கியம்.",
  "vault.passphraseShort": "குறைந்தது 12 எழுத்துகள் வேண்டும்",
  "vault.passphraseMismatch": "இரண்டு கடவுத்தொடர்களும் ஒன்றல்ல",
  "vault.createCta": "பெட்டகத்தை உருவாக்கு",

  "vault.recoveryTitle": "இதை இப்போதே எழுதி வையுங்கள்",
  "vault.recoveryBody":
    "எல்லோரும் கடவுத்தொடரை மறந்தால் பெட்டகத்திற்குள் திரும்ப வர இதுவே ஒரே வழி. இது மீண்டும் காட்டப்படாது.",
  "vault.recoveryWhere":
    "அச்சிட்டு வங்கிப் பெட்டகத்தில் வையுங்கள். புகைப்படமாகவோ, இந்தச் செயலியைத் திறக்கும் தொலைபேசியின் குறிப்பிலோ வைக்க வேண்டாம்.",
  "vault.recoveryPrint": "அச்சிடு",
  "vault.recoveryCopy": "நகலெடு",
  "vault.recoveryCopied": "நகலெடுக்கப்பட்டது",
  "vault.recoveryConfirm": "எழுதி பத்திரமாக வைத்துவிட்டேன்",
  "vault.recoveryContinue": "பெட்டகத்தைத் திற",

  "vault.unlockTitle": "திறக்கவும்",
  "vault.unlockBody": "இந்தச் சாதனத்தில் உங்கள் PIN பெட்டகத்தை மறைநீக்கும்.",
  "vault.pinPrompt": "6 இலக்க PIN",
  "vault.unlockCta": "திற",
  "vault.usePassphrase": "கடவுத்தொடரைப் பயன்படுத்து",
  "vault.usePin": "PIN-ஐப் பயன்படுத்து",
  "vault.useRecovery": "மீட்பு விசையைப் பயன்படுத்து",
  "vault.recoveryPrompt": "மீட்பு விசை",
  "vault.wrongPin": "தவறான PIN",
  "vault.wrongPassphrase": "தவறான கடவுத்தொடர்",
  "vault.deviceLocked":
    "பலமுறை தவறான PIN. சிறிது நேரம் காத்திருங்கள், அல்லது கடவுத்தொடரால் திறங்கள்.",

  "vault.enrolTitle": "உங்கள் கடவுத்தொடரைத் தேர்ந்தெடுங்கள்",
  "vault.enrolBody":
    "இது உங்கள் தனிப்பட்ட விசையைப் பாதுகாக்கும். அதன் பிறகு நிர்வாகி உங்களைப் பெட்டகத்தில் சேர்க்க வேண்டும்.",
  "vault.enrolCta": "கடவுத்தொடரைச் சேமி",

  "vault.awaitingTitle": "அனுமதிக்காகக் காத்திருக்கிறது",
  "vault.awaitingBody":
    "உங்கள் விசை பதிவாகிவிட்டது. நிர்வாகி உங்களைச் சேர்த்த பிறகே எதுவும் தெரியும் — பெட்டகம் காலியாக இல்லை, இது பிழையும் அல்ல.",
  "vault.awaitingRefresh": "மீண்டும் பார்",

  "vault.pinTitle": "இந்தச் சாதனத்திற்கு PIN அமைக்கவும்",
  "vault.pinBody":
    "ஒவ்வொரு முறையும் கடவுத்தொடரைத் தட்டச்சு செய்யத் தேவையில்லை. ஐந்து தவறான PIN இந்தச் சாதனத்தைப் பூட்டும்; பத்து அதை நீக்கும்.",
  "vault.pinDeviceName": "சாதனப் பெயர்",
  "vault.pinDeviceNamePlaceholder": "அம்மாவின் தொலைபேசி",
  "vault.pinAgain": "PIN-ஐ மீண்டும் உள்ளிடுங்கள்",
  "vault.pinMismatch": "இரண்டு PIN-களும் ஒன்றல்ல",
  "vault.pinWeak": "வரிசையான இலக்கங்களோ ஒரே இலக்கம் ஆறு முறையோ வேண்டாம்",
  "vault.pinCta": "PIN அமை",
  "vault.pinSkip": "இப்போது வேண்டாம்",

  "vault.devices": "உங்கள் சாதனங்கள்",
  "vault.deviceRemove": "நீக்கு",
  "vault.deviceNever": "பயன்படுத்தப்படவில்லை",
  "vault.deviceLastUsed": "கடைசியாக {when}",
  "vault.deviceLockedUntil": "{when} வரை பூட்டப்பட்டுள்ளது",
  "vault.deviceNone": "எந்தச் சாதனத்திலும் இன்னும் PIN அமைக்கப்படவில்லை.",

  "vault.lock": "பெட்டகத்தைப் பூட்டு",
  "vault.signOut": "வெளியேறு",
  "vault.locked": "பூட்டப்பட்டுள்ளது",

  // ---- Badges ----
  "badge.overdueDays": "{n} நாள் தாமதம்",
  "badge.due": "{when} திரும்ப",
};

const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, ta };

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // English on first render so the prerendered HTML is deterministic; the stored
  // preference is adopted on mount, same as the vault state.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ta" || stored === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(stored);
    }
  }, []);

  // Configured during render, not in an effect: children format dates and
  // weights while rendering, and an effect would run a render too late, leaving
  // the first frame after a language switch in the previous locale. The call is
  // idempotent and derived purely from `lang`, so repeating it is harmless.
  configureFormatting({
    locale: lang === "ta" ? "ta-IN" : "en-IN",
    gram: CATALOGS[lang]["unit.gram"],
  });

  // DOM mutation does belong in an effect.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice simply won't persist across reloads.
    }
  }, []);

  const t = useCallback<TFunction>(
    (key, params) => {
      let text: string = CATALOGS[lang][key] ?? en[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}

/** Convenience: `const t = useT()`. */
export function useT(): TFunction {
  return useI18n().t;
}

// ---- Domain key helpers ----------------------------------------------------
// Enum values in the data model line up 1:1 with catalog key suffixes, so these
// stay correct as long as both sides use the same identifiers.

export const statusKey = (s: ItemStatus) => `status.${s}` as MessageKey;
export const categoryKey = (c: JewelryCategory) => `category.${c}` as MessageKey;
export const docTypeKey = (d: DocumentType) => `docType.${d}` as MessageKey;
export const movementTypeKey = (m: MovementType) => `movementType.${m}` as MessageKey;
export const notifKindKey = (k: AppNotification["kind"]) => `notifKind.${k}` as MessageKey;

/** Renders a notification's title and body from its kind + stored params. */
export function useNotificationText(): (n: AppNotification) => { title: string; body: string } {
  const t = useT();
  return useCallback(
    (n: AppNotification) => ({
      title: t(`notif.${n.kind}.title` as MessageKey, n.params),
      body: t(`notif.${n.kind}.body` as MessageKey, n.params),
    }),
    [t],
  );
}

/**
 * Localised "in 3 days" / "2 days ago". Replaces the English-only helper that
 * previously lived in format.ts.
 */
export function useRelativeDays(): (from: string, to: string) => string {
  const t = useT();
  return useCallback(
    (from: string, to: string) => {
      const d = daysBetween(from, to);
      if (d === 0) return t("date.today");
      if (d === 1) return t("date.tomorrow");
      if (d === -1) return t("date.yesterday");
      return d > 0 ? t("date.inDays", { n: d }) : t("date.daysAgo", { n: Math.abs(d) });
    },
    [t],
  );
}

/** Localised karat display: "22K" in English, "22 மாற்று" in Tamil. */
export function usePurity(): (karat: number) => string {
  const t = useT();
  return useCallback((karat: number) => t("unit.purity", { k: karat }), [t]);
}
