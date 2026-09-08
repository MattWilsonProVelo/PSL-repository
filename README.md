# PSL Control Room — app scaffold

The real backend behind the PSL board suite, per §11 of `PSL_CRM_Schema_v1.md`.
Not a finished app — a working skeleton with the two hardest pieces (real
per-person login, and the domain-wide-delegation sync) already proven out.

## What's here

- **Login** (`src/app/login`, `src/auth.ts`) — Google sign-in restricted to
  `@provelosuperleague.com` accounts. This is what makes "you only see your
  own inbox" actually true.
- **Protected dashboard** (`src/app/dashboard`) — placeholder page proving
  the login → session → per-viewer identity chain works. The real per-board
  UIs (Sponsorship, Ops, Media & Marketing, WIP, Meets, Finances — currently
  live as separate Claude Artifacts, see the main doc's §10) get rebuilt as
  pages here over time, each querying Postgres scoped to the logged-in
  person via `src/lib/db.ts`.
- **Schema** (`schema.sql`) — the full data model: §4's sponsorship spine,
  §2's finance-access split, and §11's new `email_log` / `drive_log` /
  `calendar_log` / `meeting_action_item` tables, with Postgres row-level
  security enforcing "own rows only" on the two truly personal tables.
- **Sync worker** (`worker/`) — uses the §8 service account to impersonate
  each of the four staff accounts, pull calendar events (title/time/
  attendees only, no descriptions — per Matt's direction) and new Gemini
  meeting notes, parse action items, and email owners.
- **Cron** (`vercel.json`, `src/app/api/cron/sync-action-items`) — runs the
  sync worker twice daily via Vercel Cron (a plain serverless function, not
  a scheduled Claude session — the cheap option, since this runs forever).

## Running it locally

```
npm install
cp .env.local.example .env.local   # fill in the values, see comments in that file
npm run dev
```

## What's still needed before this does anything real

1. **Deploy it.** Push this to a GitHub repo, import it into Vercel (free
   tier is fine), add a Postgres database from Vercel's dashboard, and run
   `schema.sql` against it once.
2. **A Google OAuth client for login** (separate from the §8 service
   account) — console.cloud.google.com → APIs & Services → Credentials →
   Create Credentials → OAuth client ID → Web application. Add the
   deployed URL's `/api/auth/callback/google` as an authorized redirect URI.
3. **Add `gmail.send` to the existing domain-wide delegation scopes**
   (admin.google.com, same Client ID as §8) — the sync worker can't email
   action items to owners without it; the three read-only scopes already
   granted aren't enough for that one step.
4. **Double-check the cron times.** `vercel.json` assumes Adelaide standard
   time (no daylight saving) for 8:30am/2:30pm — Vercel Cron always runs in
   UTC and doesn't adjust for DST, so this will drift an hour during
   Adelaide's daylight-saving months (roughly Oct–Apr). Worth revisiting
   closer to October, or building in a fixed UTC-offset correction.
5. Set every env var from `.env.local.example` in Vercel's project settings.

None of steps 1–5 need doing today. Flag when it's time to actually go live
and we'll work through the account setup together.
