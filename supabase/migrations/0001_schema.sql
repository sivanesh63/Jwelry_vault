-- Jewelry Vault — schema
--
-- Mirrors src/lib/types.ts. Two naming notes:
--   * The TypeScript `User` maps to `public.members` here. `public.users` would
--     sit confusingly next to Supabase's `auth.users`, and the two mean
--     different things: auth.users is a login, members is a person in a family.
--   * The TypeScript `Settings` object is folded into `families`, since every
--     field on it is per-family anyway.
--
-- `family_id` is on every table from day one. Adding a tenant key later is a
-- brutal migration; carrying it now makes multi-family support a policy change.

-- ---------------------------------------------------------------- enums ----

create type public.member_role       as enum ('admin', 'member');
create type public.locker_type       as enum ('bank', 'home');
create type public.item_status       as enum ('in_locker', 'with_member', 'in_transit', 'at_jeweler', 'lost');
create type public.movement_type     as enum ('takeout', 'return', 'transfer', 'service', 'lost');
create type public.document_type     as enum ('invoice', 'hallmark', 'insurance', 'warranty', 'other');
create type public.jewelry_category  as enum ('necklace', 'bangle', 'ring', 'earring', 'chain', 'bracelet', 'anklet', 'coin', 'other');
create type public.audit_entity      as enum ('jewelry', 'movement', 'locker', 'event', 'user', 'settings');
create type public.notification_kind as enum ('overdue', 'due_soon', 'event_upcoming', 'locker_visit', 'missing_document', 'document_expiring');
create type public.app_language      as enum ('en', 'ta');

-- ------------------------------------------------------------- families ----

create table public.families (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  -- Maintained by hand in Phase 1; automatic rate fetching comes later.
  gold_rate_per_gram_24k    numeric(12, 2) not null default 0,
  gold_rate_updated_on      date,
  currency                  text not null default 'INR',
  due_soon_lead_days        int  not null default 3,
  event_reminder_lead_days  int  not null default 3,
  -- Prices are opt-in; see the Settings toggle in the app.
  show_prices               boolean not null default false,
  created_at                timestamptz not null default now()
);

-- -------------------------------------------------------------- members ----

create table public.members (
  -- Same id as the Supabase auth user, so auth.uid() joins directly.
  id            uuid primary key references auth.users (id) on delete cascade,
  family_id     uuid not null references public.families (id) on delete cascade,
  display_name  text not null,
  email         text not null,
  role          public.member_role not null default 'member',
  is_active     boolean not null default true,
  initials      text not null default '',
  -- Language for push notifications. The in-app language is a per-device
  -- choice, but the Worker sends from the server and needs to know which
  -- catalogue to render each recipient's message in.
  language      public.app_language not null default 'en',
  created_at    timestamptz not null default now()
);

create index members_family_idx on public.members (family_id);

-- -------------------------------------------------------------- lockers ----

create table public.lockers (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  name                text not null,
  type                public.locker_type not null default 'bank',
  branch              text,
  locker_number       text,
  key_holder_id       uuid references public.members (id) on delete set null,
  visit_interval_days int,
  last_visited_on     date,
  created_at          timestamptz not null default now()
);

create index lockers_family_idx on public.lockers (family_id);

-- -------------------------------------------------------------- jewelry ----

create table public.jewelry (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families (id) on delete cascade,

  -- Descriptive
  name               text not null,
  category           public.jewelry_category not null default 'other',
  -- Free-text name, used only when category = 'other'.
  custom_category    text,
  photos             text[] not null default '{}',
  gross_weight       numeric(10, 2) not null default 0,
  net_gold_weight    numeric(10, 2) not null default 0,
  stone_weight       numeric(10, 2) not null default 0,
  purity             int not null default 22,
  hallmark_no        text,
  purchase_date      date,
  purchase_price     numeric(14, 2),
  jeweler            text,
  notes              text,

  -- State
  status             public.item_status not null default 'in_locker',
  -- Whose jewelry it is. Distinct from who physically holds it right now.
  owner_id           uuid references public.members (id) on delete set null,
  current_holder_id  uuid references public.members (id) on delete set null,
  current_locker_id  uuid references public.lockers (id) on delete set null,
  expected_return_on date,

  -- Admin "delete" archives; movement history must never be orphaned.
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint jewelry_purity_range check (purity between 1 and 24),
  -- A custom name only means something on an "other" item.
  constraint jewelry_custom_category_only_on_other
    check (custom_category is null or category = 'other'),
  -- An item in a locker must say which one; one held by someone must say who.
  constraint jewelry_location_matches_status check (
    (status = 'in_locker'   and current_locker_id is not null and current_holder_id is null) or
    (status = 'with_member' and current_holder_id is not null) or
    (status in ('in_transit', 'at_jeweler', 'lost'))
  )
);

create index jewelry_family_idx   on public.jewelry (family_id) where is_archived = false;
create index jewelry_status_idx   on public.jewelry (family_id, status);
create index jewelry_holder_idx   on public.jewelry (current_holder_id);
create index jewelry_locker_idx   on public.jewelry (current_locker_id);
create index jewelry_due_idx      on public.jewelry (expected_return_on)
  where expected_return_on is not null;

-- --------------------------------------------------------------- events ----

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  location   text,
  notes      text,
  created_at timestamptz not null default now(),

  constraint events_range_valid check (ends_on >= starts_on)
);

create index events_family_idx on public.events (family_id, starts_on);

-- Jewelry earmarked for an event.
create table public.event_items (
  event_id   uuid not null references public.events (id) on delete cascade,
  jewelry_id uuid not null references public.jewelry (id) on delete cascade,
  primary key (event_id, jewelry_id)
);

-- ------------------------------------------------------------ movements ----
-- Append-only. Rows are closed by setting returned_at; never updated otherwise,
-- never deleted.

create table public.movements (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families (id) on delete cascade,
  jewelry_id         uuid not null references public.jewelry (id) on delete cascade,
  type               public.movement_type not null,
  from_location      text not null default '',
  to_location        text not null default '',
  actor_id           uuid references public.members (id) on delete set null,
  holder_id          uuid references public.members (id) on delete set null,
  reason             text,
  taken_at           timestamptz not null default now(),
  expected_return_on date,
  returned_at        timestamptz,
  event_id           uuid references public.events (id) on delete set null
);

create index movements_jewelry_idx on public.movements (jewelry_id, taken_at desc);
create index movements_family_idx  on public.movements (family_id, taken_at desc);

-- The rule that makes double-checkout impossible rather than merely unlikely:
-- an item can have at most one movement still open.
create unique index movements_one_open_per_item
  on public.movements (jewelry_id)
  where returned_at is null;

-- ------------------------------------------------------------ documents ----

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  jewelry_id   uuid not null references public.jewelry (id) on delete cascade,
  type         public.document_type not null default 'other',
  file_name    text not null,
  -- Path inside the private `documents` storage bucket.
  storage_path text not null,
  expires_on   date,
  uploaded_by  uuid references public.members (id) on delete set null,
  uploaded_at  timestamptz not null default now()
);

create index documents_jewelry_idx on public.documents (jewelry_id);
create index documents_expiry_idx  on public.documents (expires_on)
  where expires_on is not null;

-- --------------------------------------------------------- locker_visits ----
-- Backs the "verify the locker" flow and its reminder.

create table public.locker_visits (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  locker_id     uuid not null references public.lockers (id) on delete cascade,
  visited_by    uuid references public.members (id) on delete set null,
  visited_at    timestamptz not null default now(),
  -- Items expected but not scanned during the visit.
  discrepancies jsonb not null default '[]'::jsonb,
  notes         text
);

create index locker_visits_locker_idx on public.locker_visits (locker_id, visited_at desc);

-- ----------------------------------------------------------- valuations ----
-- Rate history, so "what was it worth last Deepavali" stays answerable.

create table public.valuations (
  id                     uuid primary key default gen_random_uuid(),
  family_id              uuid not null references public.families (id) on delete cascade,
  gold_rate_per_gram_24k numeric(12, 2) not null,
  recorded_on            date not null default current_date,
  recorded_by            uuid references public.members (id) on delete set null
);

create index valuations_family_idx on public.valuations (family_id, recorded_on desc);

-- -------------------------------------------------------- notifications ----
-- Text is not stored: `kind` selects a message template and `params` fills it,
-- so one row renders in whichever language each reader has chosen.

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  kind         public.notification_kind not null,
  params       jsonb not null default '{}'::jsonb,
  jewelry_id   uuid references public.jewelry (id) on delete cascade,
  event_id     uuid references public.events (id) on delete cascade,
  -- Null means the whole family; set to target one person.
  recipient_id uuid references public.members (id) on delete cascade,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  -- Guards against the daily cron re-sending the same reminder.
  dedupe_key   text
);

create index notifications_family_idx on public.notifications (family_id, created_at desc);
create unique index notifications_dedupe on public.notifications (dedupe_key)
  where dedupe_key is not null;

-- --------------------------------------------------- push_subscriptions ----

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

-- ------------------------------------------------------------ audit_log ----
-- `action_key` is a message-catalogue key, not display text, so the log reads
-- in whichever language the viewer has chosen.

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  actor_id    uuid references public.members (id) on delete set null,
  action_key  text not null,
  entity_type public.audit_entity not null,
  entity_id   uuid,
  detail      text not null default '',
  at          timestamptz not null default now()
);

create index audit_logs_family_idx on public.audit_logs (family_id, at desc);

-- ------------------------------------------------------------- triggers ----

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jewelry_touch_updated_at
  before update on public.jewelry
  for each row execute function public.touch_updated_at();
