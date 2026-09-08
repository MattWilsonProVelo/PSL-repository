// Turns a Gemini meeting-notes doc's text into structured action items.
//
// Google Meet's Gemini notetaker writes notes in a consistent template —
// a "Suggested next steps" (or "Action items") section with one item per
// line, each usually naming who owns it. That structure means a cheap
// text-pattern parser gets most of the way there without an LLM call on
// every run (2x/day, forever — worth avoiding the recurring cost where a
// deterministic parser will do). If PSL's actual notes docs turn out to
// vary more than this handles, the fallback is a single Claude API call per
// new doc — still far cheaper than a scheduled Claude session, since it'd
// be one prompt-and-response inside this same function, not a full agent
// run.

export interface ParsedActionItem {
  description: string;
  ownerHint: string | null; // raw name/email as written in the doc, resolved to a staff row by the caller
}

const SECTION_HEADERS = /suggested next steps|action items|next steps/i;

export function extractActionItems(notesText: string): ParsedActionItem[] {
  const lines = notesText.split("\n");
  const sectionStart = lines.findIndex((l) => SECTION_HEADERS.test(l));
  if (sectionStart === -1) return [];

  const items: ParsedActionItem[] = [];
  for (const line of lines.slice(sectionStart + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Stops at the next section heading (a short line, no bullet marker).
    if (/^[A-Z][A-Za-z ]{2,40}$/.test(trimmed) && !/^[-*•]/.test(trimmed)) break;

    const bullet = trimmed.replace(/^[-*•]\s*/, "");
    if (!bullet) continue;

    // Gemini notes typically phrase these as "Name to do X" or "Name: do X".
    const match = bullet.match(/^([A-Z][a-zA-Z]+)\s*(?:to|:)\s*(.+)$/);
    items.push(
      match
        ? { ownerHint: match[1], description: match[2] }
        : { ownerHint: null, description: bullet }
    );
  }
  return items;
}

// Maps §10's board-routing categories by keyword — same job I (Claude) do
// manually today per §10.2, made deterministic for the automated version.
export function routeToBoard(description: string): string {
  const d = description.toLowerCase();
  if (/sponsor|deliverable|contract/.test(d)) return "sponsorship";
  if (/social|content|media|press|broadcast/.test(d)) return "media_marketing";
  if (/event|logistics|vehicle|van|ticket/.test(d)) return "ops";
  if (/invoice|fee|payment|budget/.test(d)) return "finances";
  return "wip";
}
