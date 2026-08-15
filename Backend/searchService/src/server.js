require("dotenv").config();

const express = require("express");

const app = express();
const port = process.env.PORT || 8008;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    service: "search-service",
    status: "ok",
  });
});

app.post("/search", async (req, res) => {
  try {
    const {
      phaseObjective = "",
      stageObjective = "",
      currentIdea = "",
    } = req.body || {};

    const cleanPhaseObjective =
      String(phaseObjective || "").trim() || "No phase objective provided";

    const cleanStageObjective =
      String(stageObjective || "").trim() || "No stage objective provided";

    const cleanCurrentIdea =
      String(currentIdea || "").trim() ||
      "No current project idea provided";

    if (
      cleanPhaseObjective === "No phase objective provided" &&
      cleanStageObjective === "No stage objective provided" &&
      cleanCurrentIdea === "No current project idea provided"
    ) {
      return res.status(400).json({
        error: "At least one search context value is required",
      });
    }

    if (!process.env.TAVILY_API_KEY) {
      return res.status(500).json({
        error: "TAVILY_API_KEY is not configured",
      });
    }

    const query = [
      `Phase objective: ${cleanPhaseObjective}`,
      `Stage objective: ${cleanStageObjective}`,
      `Current idea: ${cleanCurrentIdea}`,
    ].join("\n");

    const tavilyResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 5,
      }),
    });

    const data = await tavilyResponse.json();

    if (!tavilyResponse.ok) {
      return res.status(tavilyResponse.status).json({
        error: "Tavily search failed",
      });
    }

    return res.json({
      query,
      results: Array.isArray(data.results) ? data.results : [],
    });
  } catch (error) {
    console.error("Search service error:", error.message);

    return res.status(500).json({
      error: "Internal search service error",
    });
  }
});

app.listen(port, () => {
  console.log(`Search service running on port ${port}`);
});