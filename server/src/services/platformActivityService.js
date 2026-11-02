import { prisma } from "../db/client.js";
import { reportWindow } from "./platformAnalyticsService.js";

// Each entry is backed by an actual durable row. Derived events are labeled
// as such; never reconstruct imaginary timing/cost information.
export async function listOperationalActivity({ page = 1, limit = 20, days = 90 } = {}) {
  const pageSize = Math.max(1, Math.min(50, Number(limit) || 20));
  const currentPage = Math.max(1, Math.min(20, Number(page) || 1));
  const { since } = reportWindow(days);
  const take = Math.min(1000, currentPage * pageSize);
  const created = { gte: since };
  const [savedCount, traceCount, projectCount, researchCount, auditCount, creditCount,
    saved, traces, projects, sessions, audits, credits] = await Promise.all([
    prisma.projectActivity.count({ where: { createdAt: created } }),
    prisma.generationTrace.count({ where: { createdAt: created } }),
    prisma.project.count({ where: { createdAt: created } }),
    prisma.researchSession.count({ where: { createdAt: created } }),
    prisma.adminAuditLog.count({ where: { createdAt: created } }),
    prisma.renderCredit.count({ where: { createdAt: created } }),
    prisma.projectActivity.findMany({ where: { createdAt: created },
      orderBy: { createdAt: "desc" }, take, select: {
        id: true, projectId: true, userId: true, action: true, createdAt: true } }),
    prisma.generationTrace.findMany({ where: { createdAt: created },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, projectId: true, userId: true, stage: true, operation: true,
        status: true, durationMs: true, createdAt: true } }),
    prisma.project.findMany({ where: { createdAt: created }, orderBy: { createdAt: "desc" },
      take, select: { id: true, title: true, userId: true, createdAt: true } }),
    prisma.researchSession.findMany({ where: { createdAt: created }, orderBy: { createdAt: "desc" },
      take, select: { id: true, projectId: true, status: true, startedAt: true,
        completedAt: true, createdAt: true } }),
    prisma.adminAuditLog.findMany({ where: { createdAt: created }, orderBy: { createdAt: "desc" },
      take, select: { id: true, actorUserId: true, action: true, createdAt: true } }),
    prisma.renderCredit.findMany({ where: { createdAt: created }, orderBy: { createdAt: "desc" },
      take, select: { id: true, userId: true, renderKey: true, createdAt: true } }),
  ]);
  const rows = [
    ...saved.map(x => ({ id: "project-event:" + x.id, source: "project_activity",
      projectId: x.projectId, userId: x.userId, action: x.action, createdAt: x.createdAt })),
    ...traces.map(x => ({ id: "trace:" + x.id, source: "generation_trace",
      projectId: x.projectId, userId: x.userId, action: x.operation,
      status: x.status, durationMs: x.durationMs, createdAt: x.createdAt })),
    ...projects.map(x => ({ id: "project-created:" + x.id, source: "project_record",
      projectId: x.id, projectTitle: x.title, userId: x.userId,
      action: "project.created", createdAt: x.createdAt })),
    ...sessions.map(x => ({ id: "research-session:" + x.id, source: "research_session",
      projectId: x.projectId, action: "research.session." + x.status,
      durationMs: x.completedAt ? Math.max(0, x.completedAt.getTime() - x.startedAt.getTime()) : null,
      createdAt: x.createdAt })),
    ...audits.map(x => ({ id: "admin-audit:" + x.id, source: "admin_audit",
      userId: x.actorUserId, action: x.action, createdAt: x.createdAt })),
    ...credits.map(x => ({ id: "render-credit:" + x.id, source: "render_credit",
      userId: x.userId, projectId: x.renderKey.startsWith("project:") ? x.renderKey.slice(8) : null,
      action: "render.credit.reserved", createdAt: x.createdAt })),
  ];
  const sorted = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() ||
    a.id.localeCompare(b.id)).slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const projectIds = [...new Set(sorted.map(x => x.projectId).filter(Boolean))];
  const projectNames = projectIds.length ? await prisma.project.findMany({
    where: { id: { in: projectIds } }, select: { id: true, title: true, userId: true },
  }) : [];
  const projectById = Object.fromEntries(projectNames.map(x => [x.id, x]));
  const userIds = [...new Set(sorted.map(x => x.userId || projectById[x.projectId]?.userId).filter(Boolean))];
  const users = userIds.length ? await prisma.user.findMany({
    where: { id: { in: userIds } }, select: { id: true, email: true },
  }) : [];
  const userById = Object.fromEntries(users.map(x => [x.id, { email: x.email }]));
  const items = sorted.map(x => ({
    ...x,
    userId: x.userId || projectById[x.projectId]?.userId || null,
    user: userById[x.userId || projectById[x.projectId]?.userId] || null,
    project: x.projectId ? { title: x.projectTitle || projectById[x.projectId]?.title || "Project" } : null,
    projectTitle: undefined,
  }));
  const actualCount = savedCount + traceCount + projectCount + researchCount + auditCount + creditCount;
  const maxBrowsable = pageSize * 20;
  return {
    collectedAt: new Date().toISOString(),
    days: reportWindow(days).days,
    page: currentPage, pageSize,
    total: Math.min(maxBrowsable, actualCount),
    totalAvailable: actualCount,
    truncated: actualCount > maxBrowsable,
    items,
    coverage: "Includes persisted project activity, measured operations, project creation, research sessions, render reservations and admin changes. Legacy timing/costs were not recorded. Only the most recent 20 pages are browsable.",
  };
}
