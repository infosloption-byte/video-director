import { Router } from "express";
import { prisma } from "../db/client.js";

const router = Router();

// GET /api/signals?category=Physics
// Stage A — suggested feed. M0 scope: return seeded rows, newest scrape
// first. `category` is optional and matches BUILD_PLAN §4.
// (M2 adds GET /api/signals/search alongside this, reusing the same shape.)
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

export default router;
