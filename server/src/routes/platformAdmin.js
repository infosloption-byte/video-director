import { Router } from "express";
import { prisma } from "../db/client.js";
import { currentMonth, PLANS } from "../services/billingService.js";
import { getRenderQueue } from "../jobs/renderQueue.js";
import { getEditorRenderQueue } from "../jobs/editorRenderQueue.js";

const router = Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

function pagination(query) {
  const page = Math.min(1000, Math.max(1, Number.parseInt(String(query.page || "1"), 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(query.limit || "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
function searchTerm(query) { return String(query.q || "").trim().slice(0, 100); }
function safeProviderReadiness() {
  const configured = (key) => Boolean(String(process.env[key] || "").trim());
  return [
    { id: "gemini", name: "Google Gemini", capability: "Research, writing and AI editing", configured: configured("GEMINI_API_KEY") },
    { id: "tavily", name: "Tavily", capability: "Research discovery", configured: configured("TAVILY_API_KEY") },
    { id: "brave", name: "Brave Search", capability: "Research discovery", configured: configured("BRAVE_API_KEY") },
    { id: "pexels", name: "Pexels", capability: "Stock video search", configured: configured("PEXELS_API_KEY") },
    { id: "tts", name: "Self-hosted TTS gateway", capability: "Narration and voice cloning", configured: configured("TTS_SERVICE_URL") },
    { id: "paddle", name: "Paddle Billing", capability: "Subscription payments", configured: configured("PADDLE_API_KEY") && configured("PADDLE_WEBHOOK_SECRET") },
  ];
}

async function queueSummary(queueFactory) {
  if (!process.env.REDIS_URL) return { available: false, error: "Redis not configured" };
  try {
    const counts = await queueFactory().getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return { available: true, counts };
  } catch (_error) {
    return { available: false, error: "Queue status unavailable" };
  }
}

router.get("/overview", async (_req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 86400000);
    const month = currentMonth();
    const [users, verifiedUsers, newUsers, projects, completedProjects, activeSubscriptions,
      voices, media, renders, subscriptionGroups, projectGroups, recentProjects, activity, audit, webhookEvents] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.project.count(),
      prisma.project.count({ where: { renderUrl: { not: null } } }),
      prisma.billingSubscription.count({ where: { status: { in: ["active", "trialing"] } } }),
      prisma.voiceProfile.count(),
      prisma.projectMedia.count(),
      prisma.monthlyRenderUsage.aggregate({ where: { month }, _sum: { used: true } }),
      prisma.billingSubscription.groupBy({ by: ["plan", "status"], _count: { _all: true } }),
      prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.project.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, title: true, status: true, userId: true, createdAt: true } }),
      prisma.projectActivity.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, projectId: true, action: true, createdAt: true } }),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, actorUserId: true, targetUserId: true, action: true, createdAt: true } }),
      prisma.billingWebhookEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 8, select: { eventType: true, occurredAt: true } }),
    ]);
    const [storyboardQueue, editorQueue] = await Promise.all([
      queueSummary(getRenderQueue), queueSummary(getEditorRenderQueue),
    ]);
    res.json({
      collectedAt: new Date().toISOString(),
      totals: { users, verifiedUsers, newUsers7d: newUsers, projects, completedProjects, activeSubscriptions, voiceProfiles: voices, mediaAssets: media, rendersThisMonth: renders._sum.used || 0, month },
      subscriptions: subscriptionGroups.map((x) => ({ plan: x.plan, status: x.status, count: x._count._all, planPriceUsd: PLANS[x.plan]?.monthlyUsd ?? null })),
      projectsByStatus: projectGroups.map((x) => ({ status: x.status, count: x._count._all })),
      recentProjects, recentActivity: activity, adminAudit: audit, webhookEvents,
      queues: { storyboard: storyboardQueue, editor: editorQueue },
      integrations: safeProviderReadiness(),
    });
  } catch (error) {
    console.error("[platform-admin] overview failed:", error);
    res.status(500).json({ error: "Unable to load platform overview." });
  }
});

router.get("/users", async (req, res) => {
  try {
    const { page, pageSize, skip } = pagination(req.query);
    const q = searchTerm(req.query);
    const where = q ? { OR: [{ email: { contains: q } }, { displayName: { contains: q } }] } : {};
    if (["user", "platform_admin"].includes(req.query.role)) where.role = req.query.role;
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize,
        select: { id: true, email: true, displayName: true, role: true, emailVerifiedAt: true, planSelectedAt: true, createdAt: true,
          subscription: { select: { plan: true, status: true, periodEnd: true } } } }),
    ]);
    res.json({ page, pageSize, total, items: rows });
  } catch (error) {
    console.error("[platform-admin] users failed:", error);
    res.status(500).json({ error: "Unable to load platform users." });
  }
});

router.get("/projects", async (req, res) => {
  try {
    const { page, pageSize, skip } = pagination(req.query);
    const q = searchTerm(req.query);
    const where = q ? { title: { contains: q } } : {};
    const statuses = ["researching", "setup", "storyboard", "finalize", "rendering", "published"];
    if (statuses.includes(req.query.status)) where.status = req.query.status;
    const [total, rows] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize,
        select: { id: true, userId: true, title: true, status: true, createdAt: true, durationSeconds: true, renderUrl: true, _count: { select: { scenes: true, media: true } } } }),
    ]);
    const owners = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } });
    const byId = new Map(owners.map((r) => [r.id, r.email]));
    res.json({ page, pageSize, total, items: rows.map((r) => ({ id: r.id, userId: r.userId, ownerEmail: byId.get(r.userId) || null, title: r.title, status: r.status, createdAt: r.createdAt, durationSeconds: r.durationSeconds, rendered: Boolean(r.renderUrl), scenes: r._count.scenes, media: r._count.media })) });
  } catch (error) {
    console.error("[platform-admin] projects failed:", error);
    res.status(500).json({ error: "Unable to load platform projects." });
  }
});

router.get("/subscriptions", async (req, res) => {
  try {
    const { page, pageSize, skip } = pagination(req.query);
    const q = searchTerm(req.query);
    const where = q ? { user: { email: { contains: q } } } : {};
    const [total, rows] = await Promise.all([
      prisma.billingSubscription.count({ where }),
      prisma.billingSubscription.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize,
        select: { id: true, plan: true, status: true, periodEnd: true, cancelAtPeriodEnd: true, updatedAt: true, user: { select: { id: true, email: true, displayName: true } } } }),
    ]);
    res.json({ page, pageSize, total, items: rows });
  } catch (error) {
    console.error("[platform-admin] subscriptions failed:", error);
    res.status(500).json({ error: "Unable to load subscriptions." });
  }
});

router.get("/activity", async (req, res) => {
  try {
    const { page, pageSize, skip } = pagination(req.query);
    const [total, rows] = await Promise.all([
      prisma.projectActivity.count(),
      prisma.projectActivity.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize,
        select: { id: true, projectId: true, action: true, createdAt: true,
          user: { select: { email: true } }, project: { select: { title: true } } } }),
    ]);
    res.json({ page, pageSize, total, items: rows });
  } catch (error) {
    console.error("[platform-admin] activity failed:", error);
    res.status(500).json({ error: "Unable to load platform activity." });
  }
});

export default router;
