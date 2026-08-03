# Deployment checklist

What to create so the vault runs for real, end to end. Everything here is free
and none of it needs a credit card.

**Where things stand:** the app is a working prototype whose data lives in each
browser. Deploying it today gives a real URL your family can install, but each
person sees their own copy. The steps below turn it into one shared vault.

Legend: **[you]** needs your account/dashboard · **[me]** is code I write.

---

## 0. Accounts to create

| Account | Why | Card needed |
|---|---|---|
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Hosting + scheduled jobs | No |
| [Supabase](https://supabase.com/dashboard/sign-up) | Database, auth, file storage | No |
| GitHub | Already done — `sivanesh63/Jwelry_vault` | — |

Optional, only if invite emails become a nuisance (see step 2.5):
[Resend](https://resend.com/signup) — 3,000 emails/month free.

---

## 1. Deploy what exists — 10 minutes, do this first

Worth doing before any backend work: it proves the pipeline and gives the family
something to react to on their phones.

**[you]** In the Cloudflare dashboard → **Workers & Pages** → **Create** →
**Pages** → **Connect to Git** → pick `sivanesh63/Jwelry_vault`, then set:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `out` |
| Root directory | `web` |
| Environment variable | `NODE_VERSION` = `20` |

`NODE_VERSION` is not optional — Next 16 requires Node 20.9+, and Pages defaults
to an older version that will fail the build.

You get `https://<project>.pages.dev`. Every push to `main` redeploys; every
other branch gets its own preview URL.

---

## 2. Supabase project

**[you]** Create a project. Choose region **South Asia (Mumbai) `ap-south-1`** —
closest to you, and latency is the one thing you can't fix later without a
migration.

Save the database password somewhere safe; it is shown once.

### 2.1 Collect three values — [you]

Project **Settings → API**:

| Value | Used by | Secret? |
|---|---|---|
| Project URL | Web app + Worker | No |
| `anon` public key | Web app | No — safe in the browser |
| `service_role` key | Worker only | **Yes — never in the browser** |

The `service_role` key bypasses every access rule. It goes only into Worker
secrets, never into a `NEXT_PUBLIC_*` variable or the repo.

### 2.2 Schema and access rules — [me]

I'll write `supabase/migrations/*.sql` covering:

- All 12 tables from the plan, with `family_id` on every one
- The unique partial index that makes double-checkout impossible
- Row Level Security policies on every table
- A test proving a member cannot read another family's rows

**[you]** run them — either paste into the SQL editor, or
`npx supabase db push` after `npx supabase link`.

### 2.3 Storage buckets — [you]

**Storage → New bucket**, all three **private** (not public):

- `jewelry-photos`
- `documents`
- `backups`

Private matters: public buckets expose every photo to anyone who guesses a URL.
The app will use time-limited signed URLs instead.

### 2.4 Lock down sign-up — [you]

**Authentication → Sign In / Providers → Email**: turn **off** "Allow new users
to sign up".

Without this, anyone who finds the URL can create an account inside your family
vault. Members get in by invitation only, which the app already assumes.

### 2.5 Invite emails — [you], only if needed

Supabase's built-in sender is development-grade: a few emails per hour, and they
say not to rely on it in production. For inviting 10 people once, it is usually
fine. If password resets start bouncing, add Resend as custom SMTP under
**Authentication → Emails → SMTP Settings**. Ten minutes, still free.

### 2.6 Point the web app at Supabase — [you]

Back in **Cloudflare Pages → Settings → Environment variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL       = https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon key>
```

Add them to **both** Production and Preview, then redeploy.

### 2.7 Swap the data layer — [me]

`src/lib/store.tsx` is the only module that knows where data comes from, so this
is one file plus a new `src/lib/supabase.ts`. The screens do not change.

Also mine: real auth on the login screen, the invite flow, and photo upload with
browser-side compression to ~400 KB (the difference between fitting ~600 photos
in the free tier and ~80).

---

## 3. Push notifications

### 3.1 Generate VAPID keys — [you]

```bash
npx web-push generate-vapid-keys
```

Keep both halves. The public key goes in the web app, the private key only into
Worker secrets.

### 3.2 Service worker and subscribe flow — [me]

Registers the service worker, requests permission at the right moment, and
stores each device's subscription in `push_subscriptions`.

The onboarding screen already tells people to add the app to their Home Screen
first — on iPhone that is not advice, it is a requirement. Safari only delivers
push to an installed PWA, so skipping it silently disables every reminder for
that person.

---

## 4. The scheduled Worker

This is what makes reminders arrive when nobody has the app open.

### 4.1 Worker code — [me]

A `worker/` folder with three cron jobs:

| Job | Schedule | Why |
|---|---|---|
| Reminders | Daily 08:00 IST | Overdue, due-soon, events, locker visits, expiring documents |
| Keep-alive | Every 3 days | **Non-optional** — see below |
| Backup | Nightly | Full JSON export into the `backups` bucket |

**The keep-alive is not busywork.** Supabase pauses free projects after about a
week of inactivity, and a jewelry vault gets opened maybe monthly — so without
it your family would hit a paused project nearly every visit and need you to
restore it manually.

### 4.2 Deploy it — [you]

```bash
cd worker
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT      # mailto:you@example.com
npx wrangler deploy
```

---

## 5. Optional: your own domain

`your-vault.pages.dev` is free and perfectly good for family use. A custom
domain is about ₹900/year at Cloudflare Registrar (sold at cost). This is the
only thing in the entire system that costs money, and only by choice.

---

## Where every secret lives

| Secret | Cloudflare Pages env | Worker secret | In the repo |
|---|---|---|---|
| Supabase URL | Yes (`NEXT_PUBLIC_`) | Yes | No |
| Supabase `anon` key | Yes (`NEXT_PUBLIC_`) | No | No |
| Supabase `service_role` key | **Never** | Yes | **Never** |
| VAPID public key | Yes (`NEXT_PUBLIC_`) | Yes | No |
| VAPID private key | **Never** | Yes | **Never** |
| Database password | No | No | No |

The root `.gitignore` already blocks `.env*`, so keys cannot be committed by
accident.

---

## Order of work

```
1. Pages deploy          [you]  ← do today, 10 min, proves the pipeline
2. Supabase project      [you]
3. Schema + RLS          [me] → you run it
4. Buckets, sign-up off  [you]
5. Data layer swap       [me]
6. Auth + invites        [me]
7. Photo upload          [me]
8. VAPID keys            [you]
9. Service worker        [me]
10. Worker + cron        [me] → you deploy
```

Steps 1 and 2 are yours and block everything else. Everything from 3 onward
alternates, so the fastest path is to get both accounts created first.

---

## Before you call it done

- [ ] A second family member can sign in on their own phone and see the same items
- [ ] Someone who is **not** in the family cannot sign up
- [ ] A photo uploads from a phone and is visible to another member
- [ ] Taking an item out on one phone shows up on another
- [ ] An overdue reminder actually arrives as a push notification
- [ ] The nightly backup file exists in the `backups` bucket
- [ ] **You have restored from that backup once** — an untested backup is not a backup
- [ ] The app still loads after two weeks of nobody opening it (keep-alive works)
