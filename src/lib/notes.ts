// #Work #ideas -> ["work", "ideas"]
export function extractTags(body: string): string[] {
  const found = body.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}
