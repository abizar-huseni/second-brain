// Server-only: optional web search so the assistant can check rules, costs and deadlines.
// Free: Tavily gives 1,000 searches a month with no card (TAVILY_API_KEY in Vercel).
export type Finding = { title: string; url: string; content: string };

export const researchConfigured = () => Boolean(process.env.TAVILY_API_KEY);

export async function search(query: string): Promise<Finding[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 4 }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Finding[] };
  return (json.results ?? []).map((r) => ({ title: r.title, url: r.url, content: (r.content ?? "").slice(0, 600) }));
}
