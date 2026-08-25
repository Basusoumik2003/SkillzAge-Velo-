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
      published_at: row?.published_date || null,
      // Which of the batch's queries actually produced this result — needed
      // once results are merged/deduped in runWebSearchBatch, so callers can
      // still record the real query_text per row (not just the first query).
      query: cleanQuery
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

/**
 * Builds the search queries used the moment a student first enters a stage —
 * see runStageStartWebSearch() in startupRoutes.js. Deliberately ignores the
 * student's chat text entirely: the query is built purely from what the
 * admin configured (stage/phase context + the stage's search_focus field)
 * plus the student's own idea, so it's identical no matter what they type.
 */
export function buildStageStartSearchQueries({ phase, stage, profile }) {
  const ideaSummary = [profile?.idea_title, profile?.problem_statement, profile?.solution_summary]
    .filter(Boolean)
    .join(" — ");
  const country = profile?.country || "India";

  const queries = [
    [stage?.stage_name, stage?.search_focus || stage?.stage_objective, ideaSummary || profile?.industry_tags, country]
      .filter(Boolean)
      .join(" "),
    [phase?.phase_name, phase?.phase_objective, profile?.industry_tags, "startup", country]
      .filter(Boolean)
      .join(" ")
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  // Two near-identical queries (e.g. a stage with no search_focus and no
  // phase_objective) waste a search call for the same results — dedupe.
  return [...new Set(queries)];
}
