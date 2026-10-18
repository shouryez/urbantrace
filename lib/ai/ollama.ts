import type { z } from "zod";

/** The model replied, but not with JSON that passes the schema, even after one retry. */
export class ModelReplyError extends Error {
  readonly lastReply: unknown;

  constructor(message: string, lastReply: unknown) {
    super(message);
    this.name = "ModelReplyError";
    this.lastReply = lastReply;
  }
}

type OllamaChatResponse = { message?: { content?: unknown } };

function requireEnv(name: "OLLAMA_URL" | "VISION_MODEL" | "EMBED_MODEL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env.local`);
  return value;
}

async function chatOnce(system: string, user: string, images: string[], jsonSchema: object, model: string): Promise<string> {
  const res = await fetch(`${requireEnv("OLLAMA_URL")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: jsonSchema, // structured output: JSON schema
      options: { temperature: 0 },
      keep_alive: "30m", // keep the model loaded between reports
      messages: [
        { role: "system", content: system },
        // images: base64 strings, no data: prefix; left out for text-only jobs
        images.length ? { role: "user", content: user, images } : { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaChatResponse;
  if (typeof data.message?.content !== "string") throw new Error("Ollama reply has no message content");
  return data.message.content;
}

type GoogleResponse = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

/** Hosted Gemma through Google AI Studio (GOOGLE_API_KEY, GOOGLE_MODEL), with structured JSON output. */
async function googleChatOnce(system: string, user: string, images: string[], jsonSchema: object, model: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GOOGLE_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [...images.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } })), { text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Google AI returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as GoogleResponse;
  const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  if (!text) throw new Error("Google AI reply has no text");
  return text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
}

/**
 * The app's model: hosted Gemma (GOOGLE_MODEL) when GOOGLE_API_KEY is set, else local Ollama (VISION_MODEL).
 * A failed hosted call (network, quota) falls back to Ollama, so the demo keeps working offline.
 */
async function appChatOnce(system: string, user: string, images: string[], jsonSchema: object): Promise<string> {
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await googleChatOnce(system, user, images, jsonSchema, process.env.GOOGLE_MODEL ?? "gemma-4-26b-a4b-it");
    } catch (err) {
      console.warn("Hosted Gemma failed, falling back to Ollama:", err instanceof Error ? err.message : err);
    }
  }
  return chatOnce(system, user, images, jsonSchema, requireEnv("VISION_MODEL"));
}

/** Which model answers, for logs and the UI. */
export function activeModel(): string {
  return process.env.GOOGLE_API_KEY ? (process.env.GOOGLE_MODEL ?? "gemma-4-26b-a4b-it") : (process.env.VISION_MODEL ?? "unset");
}

/**
 * Sends a system prompt, a user prompt and images (none for text-only jobs) to the model and returns the reply
 * validated against `schema`. An invalid reply is retried once, then throws ModelReplyError so
 * the caller can fall back to manual input. Network errors and timeouts are thrown as they are.
 */
export async function askVision<T>(
  system: string,
  user: string,
  images: string[],
  jsonSchema: object,
  schema: z.ZodType<T>,
  /** The benchmark names an Ollama model to compare; the app leaves it out and uses appChatOnce. */
  model?: string,
): Promise<T> {
  let lastReply: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = model ? await chatOnce(system, user, images, jsonSchema, model) : await appChatOnce(system, user, images, jsonSchema);
    try {
      lastReply = JSON.parse(content);
    } catch {
      lastReply = content;
      continue;
    }
    const parsed = schema.safeParse(lastReply);
    if (parsed.success) return parsed.data;
  }
  throw new ModelReplyError("Model reply failed validation twice", lastReply);
}

/** Size of nomic-embed-text vectors; must match issues.embedding vector(768). */
export const EMBED_DIMENSIONS = 768;

/**
 * F12: text embedding through Ollama's /api/embed. nomic-embed-text expects a task prefix; both
 * stored issues and new reports use "clustering:" so their vectors compare like for like.
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${requireEnv("OLLAMA_URL")}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: requireEnv("EMBED_MODEL"), input: `clustering: ${text}`, keep_alive: "30m" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed returned ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { embeddings?: unknown };
  const vector = Array.isArray(data.embeddings) ? data.embeddings[0] : null;
  if (!Array.isArray(vector) || vector.length !== EMBED_DIMENSIONS || !vector.every((n) => typeof n === "number")) {
    throw new Error("Ollama embed reply is not a 768 number vector");
  }
  return vector as number[];
}

/** The text embedded for an issue or a new report. */
export function issueEmbeddingText(category: string, summary: string): string {
  return `${category.replaceAll("_", " ")}: ${summary}`;
}
