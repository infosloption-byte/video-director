import { Router } from "express";
import { prisma } from "../db/client.js";
import { searchSourceCascade } from "../services/sourceCascade.js";

const router = Router();

// GET /api/signals?category=Physics
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;
    const signals = await prisma.signal.findMany({
      where: category && category !== "All" ? { category } : undefined,
      orderBy: [{ rank: "asc" }, { scrapedAt: "desc" }],
    });
    res.json({ signals });
  } catch (err) {
    console.error("GET /api/signals failed:", err);
    res.status(500).json({ error: "Failed to load signals." });
  }
});

// GET /api/signals/search?q=quantum+sensors
// Search results stay ephemeral. M3 will persist a result when it becomes
// the selected signal for a project.
router.get("/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Search query is required." });
  if (query.length > 200) return res.status(400).json({ error: "Search query is too long." });

  try {
    const results = await searchSourceCascade(query);
    const signals = results.map((result, index) => ({
      id: `search-${Buffer.from(result.sourceUrl).toString("base64url").slice(0, 24)}`,
      origin: "search",
      sourceType: result.sourceType,
      sourceReliability: result.sourceReliability,
      searchQuery: query,
      rank: index + 1,
      category: result.category || "TECHNOLOGY",
      heatPct: null,
      heatScore: result.searchScore,
      title: result.title,
      description: result.description,
      whyReasoning: `Search match from ${result.sourceName}; ranked by source reliability, relevance, and recency.`,
      sourceName: result.sourceName,
      sourceUrl: result.sourceUrl,
      scrapedAt: result.publishedAt || new Date(),
    }));

    res.json({ signals, query });
  } catch (err) {
    console.error("GET /api/signals/search failed:", err);
    res.status(502).json({ error: "Search sources are unavailable right now." });
  }
});

export default router;
