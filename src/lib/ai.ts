// Server-only: talks to free, OpenAI-compatible chat APIs with automatic backup.
//
// Busy (503), rate-limited (429) or broken models never reach you: each call walks a chain
// of free providers and models until one answers. Set any of these keys in Vercel:
//   AI_API_KEY          Google Gemini (aistudio.google.com) - main brain
//   NVIDIA_API_KEY      NVIDIA build.nvidia.com - free, 40 requests a minute
//   GROQ_API_KEY        Groq console.groq.com - free, about 1,000 requests a day per model
//   OPENROUTER_API_KEY  OpenRouter ":free" models - small daily cap, last resort
//   HF_TOKEN            Hugging Face Inference Providers - tiny monthly credit, last resort
// Optional overrides: AI_MODEL, AI_FALLBACK_MODELS (comma list), AI_BASE_URL, NVIDIA_MODEL,
// GROQ_MODEL, OPENROUTER_MODEL, HF_MODEL.

type Provider = { name: string; base: string; key: string; models: string[]; maxTokens?: number };

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

export function providers(): Provider[] {
  const env = process.env;
  const out: Provider[] = [];
  if (env.AI_API_KEY) {
    const main = env.AI_MODEL ?? "gemini-3.8-flash";
    // Each Gemini model has its own free quota, so falling to a sibling also dodges limits.
    const backups = list(env.AI_FALLBACK_MODELS, ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]);
    out.push({
      name: env.AI_BASE_URL?.includes("groq") ? "Groq" : env.AI_BASE_URL ? "AI" : "Gemini",
      base: env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      key: env.AI_API_KEY,
      models: [main, ...backups.filter((m) => m !== main)],
    });
  }
  if (env.NVIDIA_API_KEY)
    out.push({
      name: "NVIDIA",
      base: "https://integrate.api.nvidia.com/v1",
      key: env.NVIDIA_API_KEY,
      models: list(env.NVIDIA_MODEL, ["openai/gpt-oss-120b", "nvidia/nemotron-3-super-120b-a12b", "deepseek-ai/deepseek-v3.2", "meta/llama-3.3-70b-instruct"]),
      maxTokens: 6000,
    });
  if (env.GROQ_API_KEY)
    out.push({
      name: "Groq",
      base: "https://api.groq.com/openai/v1",
      key: env.GROQ_API_KEY,
      models: list(env.GROQ_MODEL, ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]),
      maxTokens: 6000,
    });
  if (env.OPENROUTER_API_KEY)
    out.push({
      name: "OpenRouter",
      base: "https://openrouter.ai/api/v1",
      key: env.OPENROUTER_API_KEY,
      models: list(env.OPENROUTER_MODEL, ["openrouter/free"]),
      maxTokens: 6000,
    });
  if (env.HF_TOKEN)
    out.push({
      name: "Hugging Face",
      base: "https://router.huggingface.co/v1",
      key: env.HF_TOKEN,
      models: list(env.HF_MODEL, ["openai/gpt-oss-120b"]),
      maxTokens: 6000,
    });
  return out;
}

export const aiConfigured = () => providers().length > 0;

// Which provider answered last (per server instance), for the Me page.
export let lastServedBy: string | null = null;

export class AIBusyError extends Error {
  constructor(public attempts: string[]) {
    super("Every free AI is busy right now. Your brain will try again on its own shortly.");
  }
}

const RETRY_SAME = new Set([500, 502, 503, 504]); // temporary: one quick retry, then move on
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reasoning models sometimes put their thinking inline.
const clean = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

type Opts = { budgetMs?: number; temperature?: number };

export async function chat(system: string, user: string, opts: Opts = {}): Promise<string> {
  const chain = providers();
  if (!chain.length) throw new Error("not_configured");
  const deadline = Date.now() + (opts.budgetMs ?? 50_000);
  const attempts: string[] = [];

  for (const p of chain) {
    for (const model of p.models) {
      for (let tryNo = 0; tryNo < 2; tryNo++) {
        const left = deadline - Date.now();
        if (left < 4000) throw new AIBusyError(attempts);
        try {
          const res = await fetch(`${p.base.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
            body: JSON.stringify({
              model,
              temperature: opts.temperature ?? 0.7,
              ...(p.maxTokens ? { max_tokens: p.maxTokens } : {}),
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
            signal: AbortSignal.timeout(Math.min(left - 1000, 40_000)),
          });
          const text = await res.text();
          if (res.ok) {
            const content = clean(JSON.parse(text).choices?.[0]?.message?.content ?? "");
            if (content) {
              lastServedBy = `${p.name} · ${model}`;
              return content;
            }
            attempts.push(`${p.name} ${model}: empty answer`);
            break;
          }
          attempts.push(`${p.name} ${model}: ${res.status}`);
          if (res.status === 401 || res.status === 403) break; // bad key: skip this model, the next may share it
          if (RETRY_SAME.has(res.status) && tryNo === 0) {
            await sleep(1200);
            continue;
          }
          break; // 429, 404 (model gone), 400 etc: next model
        } catch (e) {
          attempts.push(`${p.name} ${model}: ${(e as Error).name === "TimeoutError" ? "timeout" : "network"}`);
          break;
        }
      }
      // A wrong key fails every model of that provider the same way.
      if (attempts.at(-1)?.endsWith(": 401") || attempts.at(-1)?.endsWith(": 403")) break;
    }
  }
  console.error("AI chain failed:", attempts.join(" | "));
  throw new AIBusyError(attempts);
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
