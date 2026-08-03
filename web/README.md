# Jewelry Vault — web app

Clickable prototype of the family jewelry vault. Every screen is real and
navigable; data currently comes from fixtures held in the browser, not a
database. See `../Jewelry_Vault_Plan_v2.md` for the full design.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

### See it on your phone

The PWA parts — Add to Home Screen, service worker, push — only work over
HTTPS, so a plain `http://192.168.x.x` LAN address cannot test them. Use a free
Cloudflare quick tunnel, which needs no account:

```bash
npm run dev -- --hostname 0.0.0.0        # terminal 1
cloudflared tunnel --url http://localhost:3000   # terminal 2
```

Open the printed `https://….trycloudflare.com` link on your phone. It hot
reloads as files change, and behaves like the finished app.

### Build the static site

```bash
npm run build        # emits ./out — plain HTML/CSS/JS
```

`out/` is what Cloudflare Pages serves. There is no server to deploy.

## How it is put together

```
src/
  lib/
    types.ts      Domain model, mirrors the planned Postgres schema
    fixtures.ts   Sample data, anchored around a fixed DEMO_TODAY
    store.tsx     THE data layer — the only module that knows where data lives
    format.ts     Dates, weights, money, valuation, status labels
  components/
    ui.tsx        Button, Card, Field, Modal… (hand-rolled, no Radix)
    vault.tsx     Domain components: ItemRow, StatusBadge, PhotoTile
    app-shell.tsx Sidebar on desktop, bottom tabs on phones
  app/            One folder per screen
```

**The swap point is `src/lib/store.tsx`.** Screens call `useVault()` and never
touch storage directly, so replacing fixtures with Supabase queries changes that
one file rather than the UI.

## Languages

English and Tamil, switchable from the sidebar, the phone "More" sheet, Settings,
and the login screen. The choice is stored per device (`jv:lang:v1`).

Client-side rather than route-based (`/ta/…`): static export rules out the
middleware locale routing needs, and a per-device preference suits a PWA where
each family member picks once.

- `src/lib/i18n.tsx` holds both catalogs. The Tamil one is typed
  `Record<MessageKey, string>`, so a missing or misspelled key is a **compile
  error**, not a silent English fallback. 431 keys each.
- Dates and currency follow the language (`ta-IN` / `en-IN`) via
  `configureFormatting()`, called during render — an effect would run a render
  late and leave the first frame after a switch in the old locale.
- Notifications and audit entries store **keys and params, not text**
  (`{ kind: "overdue", params: { item, holder, days } }`), so one stored row
  renders in whichever language the reader chose. The Worker will do the same
  using each recipient's preference.
- User data — item names, locker names, people's names, notes — is never
  translated. A Tamil notification reads "Ramya's Wedding இன்னும் 1 நாளில்
  தொடங்குகிறது": Tamil template, name exactly as entered.
- Tamil font fallbacks and a taller `:lang(ta)` line-height are in `globals.css`;
  without them Tamil vowel signs clip or fall back to a serif.

Domain vocabulary uses real Tamil rather than transliteration where it exists —
purity is **மாற்று** (the traditional term for karat), not "காரட்".

## Decisions worth knowing

**Detail pages use query params** (`/jewelry/item/?id=…`), not `[id]` routes.
Under `output: 'export'`, a dynamic route needs `generateStaticParams()` at build
time — but real jewelry ids won't exist until runtime. Query params keep every
route a single static file that works for any id.

**`DEMO_TODAY` is fixed**, not `new Date()`. The HTML is generated at build time,
so a real clock would render different output at build and at hydration. Swap it
for the real date once data is genuinely client-fetched.

**Ids are generated in event handlers, never during render.** React's purity
rules flag `Math.random()`/`crypto.randomUUID()` in a render path, and rightly so
— the value would change on every pass. `newId()` in `lib/utils.ts` is called at
save time. Postgres takes over id generation later.

**State machine is enforced in the store**, not in the screens. `takeOut` only
acts on items with status `in_locker`, `returnItems` only on `with_member`, and
so on — the client-side mirror of the unique-open-movement index planned for
Postgres.

## What is deliberately faked

| Area | Now | Later |
|---|---|---|
| Auth | Login screen navigates through; user switcher in sidebar | Supabase Auth, invite-only |
| Storage | Gradient placeholders keyed off item id | Supabase Storage, compressed on upload |
| OCR | "Scan invoice" fills plausible values and tints the fields | tesseract.js in the browser |
| QR | Deterministic block from the item id; scanner steps through items | `qrcode` + `html5-qrcode` |
| Push | Enable button is inert | Web Push sent by a Cloudflare Worker cron |
| Export | JSON and CSV download for real | Adds xlsx via SheetJS, PDF via pdf-lib |

Item ids are already stable and printable, which is the part that has to be
right before any labels get printed.
