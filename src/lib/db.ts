import { Pool } from "pg";

// One pool, reused across requests (the standard pg pattern for serverless
// Next.js — see Vercel's Postgres docs for the pooled connection string to
// use here, since a plain long-lived pool doesn't suit serverless well at
// scale; fine as a starting point).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Runs `fn` with Postgres row-level security scoped to one staff member —
 * this is the enforcement layer for §11: every page/API route that reads
 * personal data (email_log, drive_log) MUST go through this, passing the
 * *server-resolved* staff id (looked up from the NextAuth session's email,
 * never trusted from the client) — never a plain pool.query() for those
 * tables.
 */
export async function withStaffScope<T>(
  staffId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config(..., true) scopes this to the current transaction only —
    // it cannot leak to the next request on a reused pooled connection.
    await client.query("SELECT set_config('app.current_staff_id', $1, true)", [staffId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolves a logged-in NextAuth session email to a staff.id. Called once
 * per request, right after `auth()`, before anything else touches the DB.
 */
export async function staffIdForEmail(email: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT id FROM staff WHERE email = $1", [
    email.toLowerCase(),
  ]);
  return rows[0]?.id ?? null;
}

// The sync worker (worker/sync.ts) intentionally does NOT use
// withStaffScope — it's a trusted backend process writing rows for every
// staff member in one run, not a single viewer's request. It needs a
// Postgres role that either owns these tables or has been granted
// BYPASSRLS (`ALTER ROLE ... BYPASSRLS`), otherwise its own writes would be
// silently filtered by the same RLS policies meant for the web app. Set
// that up once when provisioning the database — worth a one-line note next
// to wherever DATABASE_URL gets configured in Vercel.
export { pool };
