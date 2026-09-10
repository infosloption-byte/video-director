import { Router } from "express";
import { prisma } from "../db/client.js";
import { searchSourceCascade } from "../services/sourceCascade.js";

const router = Router();
const ALLOWED_PAGE_SIZES = [6, 12, 24, 48];
const DEFAULT_PAGE_SIZE = 12;
const ALLOWED_SORTS = new Set(["heat", "newest", "oldest", "title"]);

function pageValue(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageSizeValue(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PAGE_SIZE), 10);
  return ALLOWED_PAGE_SIZES.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function sortValue(value) {
  const sort = String(value || "heat").trim().toLowerCase();
  return ALLOWED_SORTS.has(sort) ? sort : "heat";
}

function orderByFor(sort) {
  switch (sort) {
    case "newest": return [{ scrapedAt: "desc" }, { rank: "asc" }];
    case "oldest": return [{ scrapedAt: "asc" }, { rank: "asc" }];
    case "title": return [{ title: "asc" }, { rank: "asc" }];
    default: return [{ rank: "asc" }, { scrapedAt: "desc" }];
  }
}

// GET /api/signals?category=Physics&page=1&pageSize=12&sort=heat
router.get("/", async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    const page = pageValue(req.query.page);
    const pageSize = pageSizeValue(req.query.pageSize);
    const sort = sortValue(req.query.sort);
    const where = {
      origin: "suggested",
      status: { not: "archived" },
      ...(category && category !== "All" ? { category } : {}),
    };
    const total = await prisma.signal.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const signals = await prisma.signal.findMany({
      where,
      orderBy: orderByFor(sort),
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });

    res.json({ signals, pagination: { page: currentPage, pageSize, total, totalPages }, sort, category: category || "All" });
  } catch (err) {
    console.error("GET /api/signals failed:", err);
    res.status(500).json({ error: "Failed to load signals." });
  }
});

// GET /api/signals/search?q=quantum+sensors&page=1&pageSize=12&sort=newest
// Search results stay ephemeral. M3 will persist a result when it becomes
// the selected signal for a project.
router.get("/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Search query is required." });
  if (query.length > 200) return res.status(400).json({ error: "Search query is too long." });

  const page = pageValue(req.query.page);
  const pageSize = pageSizeValue(req.query.pageSize);
  const sort = sortValue(req.query.sort);

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

    const sortedSignals = [...signals].sort((a, b) => {
      if (sort === "newest") return new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime();
      if (sort === "oldest") return new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime();
      if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      return (Number(b.heatScore) || 0) - (Number(a.heatScore) || 0) || a.rank - b.rank;
    });

    const total = sortedSignals.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pagedSignals = sortedSignals.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    res.json({ signals: pagedSignals, query, pagination: { page: currentPage, pageSize, total, totalPages }, sort });
  } catch (err) {
    console.error("GET /api/signals/search failed:", err);
    res.status(502).json({ error: "Search sources are unavailable right now." });
  }
});

export default router;
