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
  /** The benchmark compares models; the app always uses VISION_MODEL. */
  model: string = requireEnv("VISION_MODEL"),
): Promise<T> {
  let lastReply: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chatOnce(system, user, images, jsonSchema, model);
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
