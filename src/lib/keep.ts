// Google Keep has no API for personal accounts, so notes come in from a Google Takeout export.
// Everything here runs in the browser: the export never leaves your device except as the notes it saves.

export type KeepNote = { external_id: string; title: string | null; body: string; tags: string[]; created_at: string; pinned: boolean; source: "keep" | "shared" };

// A single Keep note is a few KB; anything far bigger is a broken or hostile export, so stop unpacking it.
export const MAX_FILE_BYTES = 2_000_000;

// Reads the files you want out of a .zip, using the browser's own decompression (no library).
export async function unzip(file: Blob, want: (name: string) => boolean): Promise<{ name: string; text: string }[]> {
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  const view = (u: Uint8Array) => new DataView(u.buffer, u.byteOffset, u.byteLength);
  const tail = await bytes(file.slice(Math.max(0, file.size - 65557)));
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (view(tail).getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("That isn't a zip file.");
  const t = view(tail);
  const count = t.getUint16(end + 10, true);
  const cdSize = t.getUint32(end + 12, true);
  const cdOff = t.getUint32(end + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error("This export is too big to open here. Unzip it and pick the .json files in its Keep folder instead.");
  const cd = await bytes(file.slice(cdOff, cdOff + cdSize));
  const c = view(cd);
  const out: { name: string; text: string }[] = [];
  for (let p = 0, n = 0; n < count && c.getUint32(p, true) === 0x02014b50; n++) {
    const p0 = p;
    const method = c.getUint16(p + 10, true);
    const size = c.getUint32(p + 20, true);
    const nameLen = c.getUint16(p + 28, true);
    const local = c.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + c.getUint16(p + 30, true) + c.getUint16(p + 32, true);
    if (!want(name) || (method !== 0 && method !== 8) || size > MAX_FILE_BYTES || c.getUint32(p0 + 24, true) > MAX_FILE_BYTES) continue;
    const lh = view(await bytes(file.slice(local, local + 30)));
    const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const raw = file.slice(start, start + size);
    const text = method === 0 ? await raw.text() : await inflate(raw.stream());
    if (text !== null) out.push({ name, text });
  }
  return out;
}

// Decompresses one file, giving up (null) if it grows past the cap, whatever size the zip claims.
async function inflate(stream: ReadableStream): Promise<string | null> {
  const reader = stream.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts: BlobPart[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FILE_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}

export const isKeepJson = (name: string) => /(^|\/)Keep\/[^/]+\.json$/i.test(name);

const tag = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30);

// One Takeout Keep note (JSON) → a note. Trashed notes are skipped. Linked pages keep only their URL,
// so text from the web never comes in as if you wrote it. A note someone else owns and shared with you
// comes in as "shared", so it's never followed as one of your own rules. `me` is your sign-in email; if the
// export names an owner who isn't you (or names none for a shared note), it's treated as someone else's.
export function parseKeep(text: string, me = ""): KeepNote | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (j.isTrashed) return null;
  const items = Array.isArray(j.listContent) ? (j.listContent as { text?: string; isChecked?: boolean }[]) : [];
  const links = Array.isArray(j.annotations) ? (j.annotations as { url?: string }[]).map((a) => a.url).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
  const parts = [
    typeof j.textContent === "string" ? j.textContent.trim() : "",
    items.map((i) => `${i.isChecked ? "☑" : "☐"} ${String(i.text ?? "").trim()}`).join("\n"),
    links.join("\n"),
  ].filter(Boolean);
  const title = typeof j.title === "string" && j.title.trim() ? j.title.trim().slice(0, 200) : null;
  const body = parts.join("\n\n") || title || "";
  if (!body) return null;
  const usec = Number(j.createdTimestampUsec ?? j.userEditedTimestampUsec);
  const created = Number.isFinite(usec) && usec > 0 ? new Date(usec / 1000) : new Date();
  const labels = Array.isArray(j.labels) ? (j.labels as { name?: string }[]).map((l) => tag(String(l.name ?? ""))).filter(Boolean) : [];
  const sharees = Array.isArray(j.sharees) ? (j.sharees as { isOwner?: boolean; email?: string }[]) : [];
  const owner = sharees.find((x) => x.isOwner)?.email?.toLowerCase();
  const theirs = sharees.length > 0 && (!owner || !me || owner !== me.toLowerCase());
  return {
    // Keep's export has no note id; the creation time (to the microsecond) is stable across exports.
    external_id: `keep:${Number.isFinite(usec) && usec > 0 ? usec : `${title ?? ""}:${body.slice(0, 40)}`}`,
    title,
    body: body.slice(0, 20000),
    tags: [...new Set(["keep", ...(theirs ? ["shared"] : []), ...labels])].slice(0, 8),
    created_at: created.toISOString(),
    pinned: !!j.isPinned,
    source: theirs ? "shared" : "keep",
  };
}
