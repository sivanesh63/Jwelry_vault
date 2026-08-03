# Jewelry Vault — Project Plan v2

> Revision of `Jewelry_Vault_Project_Plan.md`. Resolves the Firestore/SQLAlchemy
> conflict, adds the missing flows, and commits to a zero-cost serverless stack.

## Vision

A private, family-first digital jewelry vault to securely manage jewelry
inventory, bank locker movements, ownership, documents, and reminders.

### Constraints (hard)

- Zero infrastructure cost, no credit card on file
- Fully cloud-hosted — nothing runs at home
- Cross-platform via PWA (Android + iPhone), no app stores
- 5–10 family members, private, invite-only

---

# Architecture

## Decision: no application server

All previously server-side work moves to the browser, which removes the only
component that would cost money or sleep on a free tier.

| Concern | Tool | Where it runs |
|---|---|---|
| UI | Next.js + React + TypeScript + Tailwind + shadcn/ui | Browser |
| Forms | React Hook Form + Zod | Browser |
| Tables / charts | TanStack Table + Recharts | Browser |
| Database | Supabase Postgres | Cloud |
| Auth | Supabase Auth | Cloud |
| Files | Supabase Storage | Cloud |
| Authorization | Postgres Row Level Security | Cloud |
| Hosting | Cloudflare Pages | Cloud |
| Scheduler + push sender | Cloudflare Workers Cron Triggers | Cloud |
| OCR | tesseract.js | Browser |
| PDF export | pdf-lib / jsPDF | Browser |
| Excel export | SheetJS | Browser |
| QR generate / scan | qrcode + html5-qrcode | Browser |
| Migrations | Supabase CLI | Local → cloud |

Dropped from v1: FastAPI, SQLAlchemy, Alembic, Firestore, Firebase Storage,
Firebase Cloud Messaging, Render/Koyeb, Tesseract (Python), ReportLab, openpyxl.

## Why Supabase rather than Firebase

Cloud Storage for Firebase requires the Blaze plan on projects created after
Oct 2024 — a credit card, even at zero usage. Photos are core here, so that
fails the constraint. Supabase Storage is included free with no card.

Postgres additionally buys real foreign keys and transactions, which the
movement-tracking model depends on: a unique partial index makes it
*impossible* for one item to be checked out twice.

## Known free-tier limits (verify at signup — these change)

- Supabase: ~500 MB database, ~1 GB storage, ~50k monthly active users
- Cloudflare Pages: unlimited requests/bandwidth, ~500 builds/month
- Cloudflare Workers: ~100k requests/day, cron triggers included

Sizing: 200 items × 3 photos compressed to ~400 KB ≈ 240 MB. Compress
client-side on upload; never store camera originals.

## Operational gotchas

1. **Supabase free projects pause after ~7 days idle.** The Worker cron must
   issue a trivial query every 2–3 days or the family will hit a paused
   project nearly every visit.
2. **RLS is the entire security boundary.** With no server, every access rule
   lives in Postgres policies. Write them first, test them with a non-admin
   session, and never ship the service-role key to the client.
3. **iOS Web Push requires iOS 16.4+ and home-screen installation**, with
   permission requested from a user gesture. This must be an onboarding step.

---

# Users

## Roles

### Admin

- Invite / deactivate family members, assign roles
- Add / Edit / Archive jewelry
- Configure lockers
- Set current gold rate
- Export backups
- View audit log

### Member

- View jewelry (per visibility rule below)
- Check items out / in
- Upload photos and documents
- View history

## Visibility rule (decide before writing RLS)

Pick one and encode it in policy:

- **Open family** — every member sees all items. Simple, matches most families.
- **Owner-scoped** — a member sees items they own plus items marked shared.

Default recommendation: **open family, admin-only mutations of others' items.**
Retrofitting owner-scoping later is a policy change, not a migration, so this
is a safe starting point.

## Onboarding flow (was missing in v1)

Self-signup must be closed — otherwise anyone with the URL joins your vault.

```
Admin → Invite Member (email)
      → Supabase invite email
      → Member sets password
      → Member accepts, lands on PIN/biometric setup
      → Prompt: "Add to Home Screen"  (required for iOS push)
      → Prompt: enable notifications
      → Dashboard
```

---

# Data Model

Postgres tables. Every table carries `family_id` from day one — retrofitting a
tenant key later is a painful migration, and it makes future multi-family
support a policy change instead of a rewrite.

- `families`
- `users` — `family_id`, `role`, `display_name`, `is_active`
- `jewelry` — see below
- `lockers` — `family_id`, `name`, `type` (bank/home), `branch`, `key_holder_id`
- `movements` — append-only, never updated or deleted
- `events`
- `event_items` — join table
- `documents` — `jewelry_id`, `type`, `storage_path`, `expires_on`
- `notifications`
- `audit_logs` — referenced twice in v1 but never modeled
- `locker_visits` — backs the "locker visit reminder" that had no data behind it
- `valuations` — history, rather than one overwritten "current value"
- `push_subscriptions` — Web Push endpoints per device

## `jewelry` — key fields

Descriptive: `name`, `category`, `photos[]`, `gross_weight`, `net_gold_weight`,
`stone_weight`, `purity`, `hallmark_no`, `purchase_date`, `purchase_price`,
`jeweler`, `notes`.

State (new — v1 had no state at all):

- `status` — see state machine
- `owner_id` — whose jewelry it is
- `current_holder_id` — who physically has it *now*
- `current_locker_id`
- `expected_return_on`
- `is_archived` — Admin "delete" archives; movement history is permanent, so
  hard deletion would orphan it

**`owner` vs `holder` is a real distinction.** v1's "assigned" conflated them —
a mother may own a necklace her daughter is currently wearing.

## Item state machine (new)

```
        ┌──────────────────────────────────────┐
        │                                      │
   in_locker ──takeout──▶ with_member ──return─┤
        │                                      │
        ├──transfer──▶ in_transit ──arrive─────┤
        │                                      │
        └──send────▶ at_jeweler ──collect──────┘
                     (repair/resize — missing in v1)

   any ──▶ lost   (admin only, requires reason, irreversible)
```

Enforce with a unique partial index so an item cannot be checked out twice:

```sql
create unique index one_open_movement_per_item
  on movements (jewelry_id)
  where returned_at is null;
```

## `movements` — append-only

`jewelry_id`, `type` (takeout/return/transfer/service/lost), `from_location`,
`to_location`, `actor_id`, `holder_id`, `reason`, `taken_at`,
`expected_return_on`, `returned_at`, `event_id` (nullable).

---

# Flows

## Take out

```
Item detail → Take Out
  → who is taking it (defaults to self)
  → reason  → optional: link to an Event
  → expected return date
     (auto-filled to event_end + 1 day when an event is chosen)
  → confirm
  → movement row inserted, jewelry.status = with_member, audit entry written
```

## Return

Supports the two branches v1 omitted:

- **Partial return** — took 5 items for a wedding, returns 3. Return screen is
  a multi-select over that member's open movements.
- **Extend** — push `expected_return_on` out, logged as its own audit entry so
  the original promise is not silently rewritten.

## Transfer between lockers

Was listed as a movement type in v1 with no screen.

```
Select items → choose destination locker → status = in_transit
  → (physically move) → confirm arrival → status = in_locker
```

The `in_transit` state exists so items are never invisible mid-move.

## Event → movement chain

v1 had events and movements as disconnected features. Connected, this is the
app's highest-value automation:

```
Create Event (wedding, date range)
  → attach jewelry
  → "Take out all for this event" → bulk movement
  → expected return auto = event_end + 1
  → reminder fires the morning after
  → "Return all from this event" → bulk return
```

## QR

- Every item gets a stable UUID **at creation in Phase 1**, even though QR
  ships in Phase 3 — printed labels must never need reprinting.
- Scanning resolves to: **open item detail**, with contextual quick-actions
  (Take Out if in locker, Return if out).
- Locker-visit mode: scan many in a row to verify contents against expected,
  producing a discrepancy list.

## OCR

v1 listed Tesseract but tied it to no screen:

```
Add Jewelry → upload invoice photo
  → tesseract.js in browser
  → parse weight / price / hallmark
  → prefill form fields, each editable and clearly marked "from scan"
  → user confirms before save
```

Never save OCR output unreviewed.

## Valuation

The v1 dashboard showed "estimated value" in Phase 1, but gold price tracking
sat in Future Ideas — circular. Resolution: Admin sets a **current gold rate**
in Settings (Phase 1, manual). Value = `net_gold_weight × rate × purity_factor`.
Automatic rate fetching stays a later enhancement. Each rate change writes a
`valuations` snapshot.

---

# Notifications

Web Push only (drop FCM — Web Push covers Android and iOS PWAs).

Sent by the Cloudflare Worker cron, which holds the VAPID private key:

- Overdue return (daily 08:00)
- Return due tomorrow
- Event approaching (3 days out)
- Locker visit due (configurable interval)
- Missing document (item with no invoice after 30 days)
- Insurance/warranty expiring

The Worker also pings Supabase to prevent idle-pause, and runs the nightly
backup.

---

# Backup

v1 promised daily backups with no destination and no runner.

Nightly Worker cron → export all tables as JSON + photo manifest → write to a
second Supabase Storage bucket, and email/Drive a copy weekly. Keep 30 daily
and 12 monthly. Test a restore once before trusting it.

---

# Screens

Original 13, plus the seven that had features but no UI:

1. Login
2. Onboarding (PIN/biometric, install prompt, push permission) — *new*
3. Dashboard
4. Jewelry List
5. Jewelry Detail
6. Add/Edit Jewelry
7. Take Out
8. Return Item (multi-select, supports partial) — *revised*
9. Transfer Between Lockers — *new*
10. Movement History
11. Events
12. Family Members
13. Invite Member — *new*
14. Lockers
15. Locker Visit / Verify — *new*
16. Scan QR — *new*
17. Documents — *new*
18. Notifications
19. Audit Log — *new*
20. Settings (gold rate, reminder intervals, export)

---

# Roadmap

Re-sequenced so nothing depends on a later phase.

## Phase 0 — Foundation

- Supabase project, schema, RLS policies + a test proving a member cannot
  read another family's rows
- Cloudflare Pages deploy pipeline
- Auth + invite flow

## Phase 1 — Inventory

- Jewelry CRUD with client-side image compression
- Photo upload
- Dashboard (counts, weights, value via manual gold rate)
- Search by name / category / weight / purity
  *(holder and location search deferred to Phase 2 — that data doesn't exist yet)*

## Phase 2 — Movement

- Lockers
- Take out / return / partial return / extend
- Transfer between lockers
- Family members, owner vs holder
- Events, and the event→movement chain
- Search extended to holder + location
- Audit log

## Phase 3 — Automation

- Worker cron + Web Push
- QR generation, label printing, scan-to-detail
- Locker visit verification
- OCR-assisted entry
- PDF + Excel export

## Phase 4 — Resilience

- Offline **reads** via service worker cache
- Automatic nightly backup + tested restore
- Polish, empty states, error handling

### On offline writes

v1 put offline support in Phase 4, but offline *writes* conflict with movement
integrity — two members offline could both check out the same item, and the
unique index would reject one on sync with no good UX for the loser. Ship
offline reads only. If offline writes are ever needed, they must be queued and
server-validated, with explicit conflict resolution shown to the user.

---

# Security

- HTTPS everywhere (automatic on Cloudflare Pages)
- Invite-only; self-signup disabled
- Postgres RLS as the sole authorization layer — anon key only on the client,
  service-role key only in the Worker secret store
- Device PIN / biometric gate on app open
- Append-only movements + `audit_logs`
- Archive instead of delete
- Signed, expiring URLs for photo and document access

---

# Success Criteria

- Every family member can install on Android/iPhone without an app store
- Every item has photos and a complete, unbroken history
- The app can answer "where is it, and who has it" for any item instantly
- Nothing outside the locker is ever forgotten past its due date
- Total recurring cost stays at zero, with no payment method on file
