const CHUNK_CHAR_SIZE = 1200;
const CHUNK_CHAR_OVERLAP = 150;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/** Splits text into overlapping character chunks. Cheap stand-in for token-aware chunking. */
export function chunkText(text) {
  const clean = String(text || "").replace(/\s+\n/g, "\n").trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(clean.length, start + CHUNK_CHAR_SIZE);
    const slice = clean.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= clean.length) break;
    start = end - CHUNK_CHAR_OVERLAP;
  }
  return chunks;
}

/**
 * Calls OpenAI's embeddings endpoint for a batch of strings.
 * Returns [] (never throws) if there's no API key or the call fails —
 * callers should treat that as "not indexed yet" rather than a hard error.
 */
export async function embedTexts(texts) {
  const inputs = (texts || []).map((text) => String(text || "").slice(0, 8000)).filter(Boolean);
  if (!inputs.length) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs })
    });
    if (!response.ok) return [];
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((row) => (Array.isArray(row.embedding) ? row.embedding : null));
  } catch {
    return [];
  }
}

export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector || null;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function getEmbeddingModel() {
  return EMBEDDING_MODEL;
}
