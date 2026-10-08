// #Work #ideas -> ["work", "ideas"]
export function extractTags(body: string): string[] {
  const found = body.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

// Where a note came from (notes.source). Only the owner's own writing can become a standing rule or fact,
// so this is an allow-list: shared posts, clipboard text, AI-written notes and any new source are left out.
// Google Keep notes are your own notes app (linked pages come in as bare URLs, never their text).
export const OWN_SOURCES = ["app", "obsidian", "keep"];

// Before notes.source existed, shared and AI notes were marked with these tags instead.
const NOT_MINE_TAGS = ["shared", "brain"];

export function ownNote(n: { source?: string | null; tags?: string[] | null }): boolean {
  if (!OWN_SOURCES.includes(n.source ?? "app")) return false;
  return !(n.tags ?? []).some((t) => NOT_MINE_TAGS.includes(String(t).toLowerCase()));
}

// The database is missing notes.source until its update runs, so callers retry without it.
export const missingSource = (e: { message?: string } | null) => !!e && /source/i.test(e.message ?? "");
