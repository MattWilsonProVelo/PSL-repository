-- ProVelo Super League — Postgres schema
-- Combines §4 (sponsorship/deliverables spine) + §2 (finance access split) +
-- §11 (per-person email/Drive/calendar logs, the reason this app exists).
--
-- Run this once against a fresh database (Vercel Postgres / Neon / Supabase
-- all give you a connection string + a way to run a .sql file — psql, or
-- their web SQL editor, both work).

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ── §2: org chart & finance access ─────────────────────────────────────────

create table staff (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text unique not null,     -- must be @provelosuperleague.com
  role           text not null,
  finance_access boolean not null default false
);

insert into staff (name, email, role, finance_access) values
  ('Matt',  'matt@provelosuperleague.com',  'Head of sport, operations & PCG vision/direction', true),
  ('Aaron', 'aaron@provelosuperleague.com', 'Founder, head of commercial, sales, marketing & PCG vision/direction', true);
  -- Lucy and Tim: add once Tim's address is independently confirmed (§12 open questions).
  -- ('Lucy', 'lucy@provelosuperleague.com', 'Digital media and marketing', false),
  -- ('Tim',  'tim@provelosuperleague.com',  'Design and creative', false);

-- ── §4: sponsorship / deliverables spine ───────────────────────────────────

create table season (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  starts_on     date,
  ends_on       date
);

create table event (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid references season(id),
  name          text not null,
  location      text,
  starts_on     date,
  ends_on       date
);

create table sponsor (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  business_category text,
  status            text not null default 'prospect'
                      check (status in ('prospect','in_progress','awaiting_contact',
                                         'needs_new_contact','follow_up','needs_review',
                                         'contracted','closed','lapsed')),
  source            text,
  created_at        timestamptz not null default now()
);

create table contact (
  id            uuid primary key default gen_random_uuid(),
  sponsor_id    uuid references sponsor(id),
  name          text not null,
  role          text,
  email         text,
  phone         text,
  is_primary    boolean default false
);

create table contract (
  id                  uuid primary key default gen_random_uuid(),
  sponsor_id          uuid not null references sponsor(id),
  season_id           uuid references season(id),
  signing_entity      text not null,
  designation         text,
  business_category   text,
  commencement_date   date,
  expiry_date         date,
  renewal_option_date date,
  fee_amount          numeric(12,2),      -- finance_access-gated, see below
  fee_currency        text default 'AUD',
  invoice_due_date    date,               -- finance_access-gated, see below
  status              text not null default 'draft'
                        check (status in ('draft','executed','active','expired','terminated')),
  evidence_url        text,
  created_at          timestamptz not null default now()
);

create view contract_ops as
  select id, sponsor_id, season_id, signing_entity, designation, business_category,
         commencement_date, expiry_date, renewal_option_date, status, evidence_url
  from contract;
  -- deliberately omits fee_amount, fee_currency, invoice_due_date — the
  -- app's server-side query layer sends non-finance_access staff to this
  -- view, never to `contract` directly. See app/lib/db.ts (to be built).

create table deliverable (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contract(id),
  event_id      uuid references event(id),
  direction     text not null default 'to_sponsor'
                  check (direction in ('to_sponsor','from_sponsor')),
  type          text not null
                  check (type in ('branding_apparel','broadcast_media','event_signage',
                                   'hospitality','merchandise','appearance_presentation',
                                   'digital_recognition','naming_rights','content_production','other')),
  description   text not null,
  quantity      integer default 1,
  status        text not null default 'not_started'
                  check (status in ('not_started','in_progress','active','delivered','evidence_captured')),
  due_date      date,
  owner_id      uuid references staff(id),
  evidence_url  text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table task (
  id              uuid primary key default gen_random_uuid(),
  deliverable_id  uuid references deliverable(id),
  title           text not null,
  status          text not null default 'open'
                    check (status in ('open','in_progress','done','blocked')),
  owner_id        uuid references staff(id),
  due_date        date,
  created_at      timestamptz not null default now()
);

-- ── §11: per-person logs — the tables §8 sketched but never built ─────────
-- These are what the sync worker (worker/sync.ts) writes to, and what makes
-- "own data only" a real, enforced thing rather than a UI convention.

create table email_log (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references staff(id),   -- whose inbox this came from
  sponsor_id      uuid references sponsor(id),           -- best-effort match, nullable
  gmail_thread_id text not null,
  subject         text,
  snippet         text,
  occurred_at     timestamptz,
  gmail_link      text,
  created_at      timestamptz not null default now()
);

create table drive_log (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id),
  file_id       text not null,
  name          text,
  mime_type     text,
  modified_at   timestamptz,
  drive_link    text,
  created_at    timestamptz not null default now()
);

create table calendar_log (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id),
  event_id      text not null unique,   -- lets the sync worker upsert on re-run
  title         text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  attendees     text[],           -- email addresses, for the shared Control Room view
  calendar_link text,
  created_at    timestamptz not null default now()
  -- Deliberately no `description`/body column. Per Matt's direction, the
  -- shared team calendar shows only title, time, and attendees — the same
  -- level of detail as a normal iCal/Google Calendar week view — not full
  -- event descriptions, which can carry dial-in details or other content
  -- someone wouldn't expect the whole team to see. The sync worker should
  -- read only those three fields from the Calendar API response, not fetch
  -- or store the event body at all.
);

-- Meeting action items (§11 #2) — logged once, both trackable on a board
-- and the source for the "email the right person" step.
create table meeting_action_item (
  id                uuid primary key default gen_random_uuid(),
  meeting_title     text not null,
  meeting_date      date not null,
  drive_notes_link  text,             -- the Gemini notes doc this came from
  description       text not null,
  routed_to_board   text
                      check (routed_to_board in ('sponsorship','media_marketing','ops','finances','wip','none')),
  owner_id          uuid references staff(id),
  status            text not null default 'open'
                      check (status in ('open','in_progress','done')),
  emailed_at        timestamptz,      -- null until the owner has actually been notified
  created_at        timestamptz not null default now()
);

-- ── Row-level security: the actual enforcement, not just a nice schema ────
-- Postgres RLS policies keyed on a per-request session variable. The app
-- sets this once per request, right after resolving the NextAuth session to
-- a staff row (see app/lib/db.ts, to be built) — never trusts a staff_id
-- passed in from the client.
--
--   await sql`SELECT set_config('app.current_staff_id', ${staffId}, true)`;
--
-- `true` (the third argument) scopes it to the current transaction only, so
-- it can't leak between requests on a pooled connection.

alter table email_log enable row level security;
alter table drive_log enable row level security;
alter table calendar_log enable row level security;

create policy email_log_own_rows on email_log
  using (staff_id = current_setting('app.current_staff_id', true)::uuid);

create policy drive_log_own_rows on drive_log
  using (staff_id = current_setting('app.current_staff_id', true)::uuid);

-- calendar_log is the one exception: §11 #4 wants a *shared* team calendar
-- view on Control Room, so unlike email/Drive it's readable domain-wide,
-- not restricted to staff_id = self. If that changes (e.g. someone wants
-- personal, non-PSL events kept private), swap this for an own-rows policy
-- like the two above, or add an `is_private` flag staff can set per event.
create policy calendar_log_shared_read on calendar_log
  using (true);
