// AI proxy: the browser never sees the Anthropic key.
// Checks the Supabase login, counts requests per user per day, then streams Claude's text back.
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 60);
const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
// Server-side refusal fallback is available on these models only.
const FALLBACK_OK = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL);

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM =
  "Ты помощник внутри приложения для подготовки к IELTS Academic. Ученики говорят по-русски, уровень обычно A2–B2. " +
  "Выполняй задание из сообщения пользователя точно и кратко. Не используй markdown-разметку, если об этом не просят.";

async function userFromToken(token) {
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function bump(uid) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/ai_bump`, {
    method: "POST",
    headers: { apikey: SB_SERVICE, ...(String(SB_SERVICE).startsWith("sb_") ? {} : { Authorization: `Bearer ${SB_SERVICE}` }), "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });
  if (!r.ok) throw new Error("usage counter failed: " + r.status);
  return Number(await r.json());
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: "ai_disabled" }); return; }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = await userFromToken(token);
  if (!user) { res.status(401).json({ error: "auth" }); return; }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const prompt = body.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000) { res.status(400).json({ error: "prompt" }); return; }

  let used;
  try { used = await bump(user.id); } catch (e) { res.status(500).json({ error: "usage" }); return; }
  if (used > DAILY_LIMIT) { res.status(429).json({ error: "limit", limit: DAILY_LIMIT }); return; }

  const wantJson = !!body.json;
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: body.tier === "quick" ? "low" : "medium" },
    system: SYSTEM + (wantJson ? " Верни только валидный JSON без пояснений и без обрамления ```." : ""),
    messages: [{ role: "user", content: prompt }],
  };
  if (FALLBACK_OK) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-AI-Remaining", String(Math.max(0, DAILY_LIMIT - used)));
  try {
    const stream = client.beta.messages.stream(params);
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") res.write(ev.delta.text);
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") res.write("\n[Запрос отклонён. Попробуй сформулировать иначе.]");
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      const status = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
      res.status(status).json({ error: "upstream" });
    } else {
      res.end("\n[Ошибка ИИ, попробуй ещё раз.]");
    }
  }
}
