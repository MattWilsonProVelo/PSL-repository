import { delegatedClient } from "./delegatedClient";
import { extractActionItems, routeToBoard } from "./actionItems";
import { pool } from "@/lib/db";

// The whole point of §11 #2 and #4, run by the twice-daily Vercel Cron job
// (src/app/api/cron/sync-action-items/route.ts) — a plain script call, not
// a Claude session, per Matt's "cheaper operating model" direction.

interface StaffRow {
  id: string;
  email: string;
}

async function allStaff(): Promise<StaffRow[]> {
  const { rows } = await pool.query("SELECT id, email FROM staff");
  return rows;
}

/** §11 #4 — shared team calendar, basic fields only (no event descriptions). */
async function syncCalendar(staff: StaffRow) {
  const { calendar } = delegatedClient(staff.email);
  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: "startTime",
  });

  for (const event of data.items ?? []) {
    if (!event.id) continue;
    await pool.query(
      `insert into calendar_log (staff_id, event_id, title, starts_at, ends_at, attendees, calendar_link)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (event_id) do update set
         title = excluded.title, starts_at = excluded.starts_at,
         ends_at = excluded.ends_at, attendees = excluded.attendees`,
      [
        staff.id,
        event.id,
        event.summary ?? null, // title only — no event.description read or stored
        event.start?.dateTime ?? event.start?.date ?? null,
        event.end?.dateTime ?? event.end?.date ?? null,
        (event.attendees ?? []).map((a) => a.email).filter(Boolean),
        event.htmlLink ?? null,
      ]
    );
  }
}

/** §11 #2 — find new Gemini notes docs and log/route/email their action items. */
async function syncActionItemsFromNotes(staff: StaffRow, sinceIso: string) {
  const { drive } = delegatedClient(staff.email);
  const { data } = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.document' and name contains 'Notes by Gemini' and modifiedTime > '${sinceIso}'`,
    fields: "files(id, name, modifiedTime, webViewLink)",
  });

  for (const file of data.files ?? []) {
    if (!file.id) continue;
    // Export the doc as plain text to parse — read-only, matches the
    // drive.readonly scope already granted in §8.
    const exported = await drive.files.export(
      { fileId: file.id, mimeType: "text/plain" },
      { responseType: "text" }
    );
    const notesText = exported.data as unknown as string;
    const parsed = extractActionItems(notesText);

    for (const item of parsed) {
      const owner = item.ownerHint
        ? await pool.query("SELECT id FROM staff WHERE name ILIKE $1", [`${item.ownerHint}%`])
        : { rows: [] as { id: string }[] };

      await pool.query(
        `insert into meeting_action_item
           (meeting_title, meeting_date, drive_notes_link, description, routed_to_board, owner_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          file.name,
          file.modifiedTime,
          file.webViewLink,
          item.description,
          routeToBoard(item.description),
          owner.rows[0]?.id ?? null,
        ]
      );
    }
  }
}

/** Emails each not-yet-notified action item to its owner, then marks it sent. */
async function emailUnsentActionItems() {
  const { rows } = await pool.query(
    `select mai.id, mai.description, mai.meeting_title, s.email, s.name
     from meeting_action_item mai
     join staff s on s.id = mai.owner_id
     where mai.emailed_at is null`
  );

  for (const row of rows) {
    // IMPORTANT — needs a scope §8 didn't authorize yet: sending mail
    // requires gmail.send, and delegation so far only granted
    // gmail.readonly/drive.readonly/calendar.readonly. Before this will
    // work, go back to admin.google.com's Domain-wide Delegation screen
    // (§8 step 4) and add gmail.send to that same Client ID's scope list —
    // no new service account or key needed, just one more scope on the
    // existing authorization.
    //
    // Sent via the service account impersonating a shared PSL address
    // (set NOTIFICATION_FROM_EMAIL — e.g. a notetaking@ alias if PSL has
    // one, or matt@ as a placeholder) rather than as the recipient's own
    // account.
    const from = process.env.NOTIFICATION_FROM_EMAIL ?? "matt@provelosuperleague.com";
    const { gmail } = delegatedClient(from);
    const raw = Buffer.from(
      `To: ${row.email}\r\nSubject: Action item — ${row.meeting_title}\r\n\r\n${row.description}`
    ).toString("base64url");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    await pool.query("update meeting_action_item set emailed_at = now() where id = $1", [row.id]);
  }
}

export async function runSync() {
  const staff = await allStaff();
  const sinceIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // since last run, roughly

  for (const s of staff) {
    await syncCalendar(s);
    await syncActionItemsFromNotes(s, sinceIso);
  }
  await emailUnsentActionItems();
}
