import { Router } from "express";
import { getPlatformAnalytics, reportWindow } from "../services/platformAnalyticsService.js";
import { prisma } from "../db/client.js";
import { getLiveOperations } from "../services/liveOperationsService.js";

const router = Router();
router.get("/live", async (_req, res) => {
  try {
    res.json(await getLiveOperations());
  } catch (error) {
    console.error("[admin-analytics] live queue failed:", error?.code || error?.message);
    res.status(500).json({ error: "Live operations are temporarily unavailable." });
  }
});
router.get("/", async (req, res) => {
  try {
    res.json(await getPlatformAnalytics(req.query.days));
  } catch (error) {
    console.error("[admin-analytics] dashboard failed:", error?.code || error?.message);
    res.status(500).json({ error: "Analytics are temporarily unavailable." });
  }
});

// Drill down into one user's generation operations. Never expose prompts,
// provider keys, voice recordings, or private external research content.
router.get("/users/:userId", async (req, res) => {
  try {
    const { since, days } = reportWindow(req.query.days);
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, email: true, displayName: true, createdAt: true,
        subscription: { select: { plan: true, status: true } } },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    const [projects, traces, renders, voices, research] = await Promise.all([
      prisma.project.findMany({ where: { userId: user.id, createdAt: { gte: since } },
        select: { id: true, title: true, status: true, durationSeconds: true,
          createdAt: true, renderUrl: true, _count: { select: { scenes: true } } },
        orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.generationTrace.findMany({ where: { userId: user.id, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" }, take: 200,
        select: { id: true, projectId: true, stage: true, operation: true,
          status: true, durationMs: true, provider: true, model: true,
          inputTokens: true, outputTokens: true, costUsd: true, costSource: true, createdAt: true } }),
      prisma.renderCredit.count({ where: { userId: user.id, createdAt: { gte: since } } }),
      prisma.voiceProfile.count({ where: { userId: user.id } }),
      prisma.researchSession.count({ where: { createdAt: { gte: since },
        project: { userId: user.id } } }),
    ]);
    res.json({ user, days, counts: { projects: projects.length, renders, voices, research },
      projects: projects.map(x => ({
        id: x.id, title: x.title, status: x.status, createdAt: x.createdAt,
        seconds: x.durationSeconds == null ? null : Number(x.durationSeconds),
        scenes: x._count.scenes, rendered: Boolean(x.renderUrl),
      })),
      traces: traces.map(x => ({
        ...x, costUsd: x.costUsd == null ? null : Number(x.costUsd),
      })),
      note: "Shows the latest 100 projects and latest 200 traces in the selected period. Unknown provider costs remain null.",
    });
  } catch (error) {
    console.error("[admin-analytics] user detail failed:", error?.code || error?.message);
    res.status(500).json({ error: "User analytics are temporarily unavailable." });
  }
});

export default router;
