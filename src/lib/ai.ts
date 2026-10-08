// Server-only: one call to any OpenAI-compatible chat API.
// Default is Google Gemini's free tier. Switch provider with env vars only, e.g. Groq:
//   AI_BASE_URL=https://api.groq.com/openai/v1  AI_MODEL=openai/gpt-oss-120b
const BASE = process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai";
const MODEL = process.env.AI_MODEL ?? "gemini-3.8-flash";

export const aiConfigured = () => Boolean(process.env.AI_API_KEY);

export async function chat(system: string, user: string): Promise<string> {
  const res = await fetch(`${BASE.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const text = await res.text();
  if (res.status === 429) throw new Error("The free AI limit is used up for now. Try again later.");
  if (!res.ok) throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).choices?.[0]?.message?.content ?? "";
}

// Models sometimes wrap JSON in ``` fences or add a sentence around it.
export function parseJson<T>(raw: string): T | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
