import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@worker/sync";

// Runs 4x/day in UTC (see vercel.json — 22:00, 23:00, 04:00, 05:00 UTC) as a
// plain Vercel Cron job, NOT a scheduled Claude session. That's the
// "cheaper operating model" call: a serverless function that runs a script
// costs close to nothing at a handful of runs/day, where a scheduled Claude
// session would spend real usage on every single run, forever. Claude's
// role here was writing this script once — it doesn't need to run again to
// execute it.
//
// Why 4 UTC times instead of 2: the target is 8:30am and 2:30pm in
// Adelaide, which is UTC+9:30 standard time (ACST) but UTC+10:30 during
// daylight saving (ACDT, roughly Oct-Apr) — a 1-hour shift Vercel Cron
// itself can't express (it's UTC-only, no timezone option). So this fires
// at both possible UTC times for each target and isAdelaideTargetTime()
// below throws away the pair that doesn't currently match local time,
// leaving exactly one real run per target per day, correct year-round.
//
// What this will do once built out (currently a stub):
//   1. Query Drive (via the §8 service account) for Gemini notes docs
//      created since the last run.
//   2. Extract action items, insert into `meeting_action_item` (schema.sql),
//      routed to the right board per its `routed_to_board` column.
//   3. For each item with an owner and emailed_at still null, send that
//      person an email (Gmail API, service account impersonating no one —
//      sent AS the service account or a shared PSL address, not as another
//      staff member) and set emailed_at.
//
// Vercel Cron authenticates itself with a bearer token matching CRON_SECRET
// (set that as an env var once deployed) — the check below rejects anyone
// else calling this URL directly.

const TARGET_HOURS = [8, 14]; // 8:30am and 2:30pm Adelaide time
const TARGET_MINUTE = 30;
const WINDOW_MINUTES = 35; // tolerate cron's on-the-hour firing vs the :30 target

function isAdelaideTargetTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const minutesSinceMidnight = hour * 60 + minute;

  return TARGET_HOURS.some((targetHour) => {
    const targetMinutes = targetHour * 60 + TARGET_MINUTE;
    return Math.abs(minutesSinceMidnight - targetMinutes) <= WINDOW_MINUTES;
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isAdelaideTargetTime(now)) {
    // Wrong half of the DST pair for today — skip without running the sync.
    return NextResponse.json({ ok: true, skipped: true, ranAt: now.toISOString() });
  }

  await runSync();
  return NextResponse.json({ ok: true, ranAt: now.toISOString() });
}
