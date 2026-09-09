import { pool } from "./db";

export type BoardKey =
  | "sponsorship"
  | "ops"
  | "media_marketing"
  | "wip"
  | "meets"
  | "finances";

// The Control Room's board registry. `slug` is the URL segment
// (/dashboard/<slug>); `key` is what's stored in staff.boards and checked
// against below. Finances is deliberately gated by `finance_access`
// instead of appearing in anyone's `boards` list — see canAccessBoard.
export const BOARDS: { key: BoardKey; slug: string; label: string }[] = [
  { key: "sponsorship", slug: "sponsorship", label: "Sponsorship" },
  { key: "ops", slug: "ops", label: "Ops" },
  { key: "media_marketing", slug: "media-marketing", label: "Media & Marketing" },
  { key: "wip", slug: "wip", label: "WIP" },
  { key: "meets", slug: "meets", label: "Meets" },
  { key: "finances", slug: "finances", label: "Finances" },
];

export interface StaffAccess {
  id: string;
  name: string;
  boards: BoardKey[];
  financeAccess: boolean;
}

/**
 * Resolves a logged-in session email to their board access. This is the
 * ONLY place that should read staff.boards / staff.finance_access — every
 * page that needs to know "can this person see X" calls this, never trusts
 * anything passed in from the client.
 */
export async function staffAccessForEmail(email: string): Promise<StaffAccess | null> {
  const { rows } = await pool.query(
    "select id, name, boards, finance_access from staff where email = $1",
    [email.toLowerCase()]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    boards: row.boards ?? [],
    financeAccess: row.finance_access,
  };
}

/**
 * Hard gate for one board. Finances checks finance_access specifically
 * (never just staff.boards, which only drives what the nav shows) — this
 * is the actual security boundary, called again at the top of every board
 * page, not only used to decide what to render in the Control Room nav.
 */
export function canAccessBoard(access: StaffAccess | null, board: BoardKey): boolean {
  if (!access) return false;
  if (board === "finances") return access.financeAccess;
  return access.boards.includes(board);
}
