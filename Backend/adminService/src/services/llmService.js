const DEFAULT_MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_STARTUP_MODEL || "gpt-5.6-luna";
const LIGHT_MODEL = process.env.OPENAI_LIGHT_MODEL || DEFAULT_MODEL;

/**
 * Raw fetch() call to OpenAI's Chat Completions endpoint — same convention
 * as the embeddings call in ragService.js (no SDK dependency).
 *
 * Throws on any failure (missing key, network error, non-2xx response) so
 * callers can decide how to degrade (e.g. fall back to a templated answer).
 */
export async function chatComplete({ systemPrompt, messages, model, temperature = 0.4, maxTokens = 900, light = false }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.code = "llm_not_configured";
    throw error;
  }

  const chatMessages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...(messages || [])
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || (light ? LIGHT_MODEL : DEFAULT_MODEL),
      messages: chatMessages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`OpenAI chat completion failed (${response.status}): ${detail.slice(0, 500)}`);
    error.code = "llm_call_failed";
    throw error;
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    const error = new Error("OpenAI chat completion returned an empty response.");
    error.code = "llm_empty_response";
    throw error;
  }

  return {
    text,
    model: data?.model || model || DEFAULT_MODEL,
    usage: data?.usage || null
  };
}

export function getDefaultModel() {
  return DEFAULT_MODEL;
}

export function getLightModel() {
  return LIGHT_MODEL;
}
