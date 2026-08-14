/**
 * Web search via Tavily (https://tavily.com) — simple REST API built for
 * LLM agents, generous free tier. Never throws: returns [] when no API key
 * is configured, the call fails, or the query is empty, so callers can
 * treat "no results" and "search unavailable" the same way.
 */
export async function runWebSearch(query, { maxResults = 5 } = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  const cleanQuery = String(query || "").trim();
  if (!apiKey || !cleanQuery) return [];

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: cleanQuery,
        search_depth: "basic",
        max_results: maxResults
      })
    });
    if (!response.ok) return [];

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((row, index) => ({
      title: String(row?.title || "").slice(0, 240),
      url: String(row?.url || "").slice(0, 2000),
      snippet: String(row?.content || "").slice(0, 1200),
      rank: index + 1,
      published_at: row?.published_date || null
    }));
  } catch {
    return [];
  }
}

/** Runs web search for multiple queries and flattens+dedupes results by URL. */
export async function runWebSearchBatch(queries, { maxResultsPerQuery = 4, maxTotal = 8 } = {}) {
  const list = (queries || []).map((q) => String(q || "").trim()).filter(Boolean);
  if (!list.length) return [];

  const batches = await Promise.all(list.map((q) => runWebSearch(q, { maxResults: maxResultsPerQuery })));
  const seenUrls = new Set();
  const merged = [];
  for (const batch of batches) {
    for (const result of batch) {
      if (!result.url || seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      merged.push(result);
      if (merged.length >= maxTotal) return merged;
    }
  }
  return merged;
}

/** Simple keyword heuristic for whether a question likely needs fresh web info. */
export function questionNeedsWebSearch(question) {
  const text = String(question || "").toLowerCase();
  const triggers = [
    "latest", "current", "today", "this year", "2025", "2026",
    "market size", "competitor", "competitors", "funding", "trend", "trending",
    "news", "recent", "statistics", "stats", "how much does", "price of",
    "regulation", "law", "compliance"
  ];
  return triggers.some((word) => text.includes(word));
}
