import { google } from "googleapis";

// The core of §8's domain-wide delegation, now used programmatically
// instead of from a Cloud Shell test script. Loads the service-account key
// and impersonates one PSL staff member at a time — exactly the pattern
// confirmed working on 26 Aug (Gmail, Drive, and Calendar all returned live
// data for matt@provelosuperleague.com in that Cloud Shell test).
//
// GOOGLE_SERVICE_ACCOUNT_KEY should hold the *contents* of the key.json
// file as a single-line JSON string (Vercel env vars are strings, not
// files) — e.g. `cat key.json | jq -c . ` to compact it before pasting into
// Vercel's dashboard.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function delegatedClient(subjectEmail: string) {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }
  const key = JSON.parse(keyJson);

  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject: subjectEmail, // <-- the impersonation, same as .with_subject() in the Python test
  });

  return {
    gmail: google.gmail({ version: "v1", auth }),
    drive: google.drive({ version: "v3", auth }),
    calendar: google.calendar({ version: "v3", auth }),
  };
}
