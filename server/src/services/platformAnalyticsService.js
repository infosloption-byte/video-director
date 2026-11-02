import { prisma } from "../db/client.js";

export function reportWindow(value) {
  const days = [7, 30, 90].includes(Number(value)) ? Number(value) : 30;
  return { days, since: new Date(Date.now() - days * 86400000) };
}

function summarizeGroups(groups) {
  return groups.map((g) => ({
    stage: g.stage,
    status: g.status,
    count: g._count._all,
    totalDurationMs: g._sum.durationMs || 0,
    averageDurationMs: Math.round(g._avg.durationMs || 0),
    verifiedCostUsd: g._sum.costUsd == null ? null : Number(g._sum.costUsd),
    inputTokens: g._sum.inputTokens || 0,
    outputTokens: g._sum.outputTokens || 0,
  }));
}

export async function getPlatformAnalytics(daysValue) {
  const { since, days } = reportWindow(daysValue);
  const where = { createdAt: { gte: since } };
  const [users, projects, rendered, sessions, credits, traces,
    knownCosts, verifiedSpend, stages, providers, topUsers, recent,
    recentProjects, durationProjects, researchByStatus, projectUsers, creditUsers] = await Promise.all([
    prisma.user.count(),
    prisma.project.count({ where: { createdAt: { gte: since } } }),
    prisma.project.count({ where: { renderUrl: { not: null }, createdAt: { gte: since } } }),
    prisma.researchSession.count({ where: { createdAt: { gte: since } } }),
    prisma.renderCredit.count({ where: { createdAt: { gte: since } } }),
    prisma.generationTrace.count({ where }),
    prisma.generationTrace.count({ where: { ...where, costUsd: { not: null } } }),
    prisma.generationTrace.aggregate({ where: { ...where, costUsd: { not: null } }, _sum: { costUsd: true } }),
    prisma.generationTrace.groupBy({
      by: ["stage", "status"], where,
      _count: { _all: true },
      _sum: { durationMs: true, costUsd: true, inputTokens: true, outputTokens: true },
      _avg: { durationMs: true },
    }),
    prisma.generationTrace.groupBy({
      by: ["provider", "model"], where,
      _count: { _all: true }, _sum: { costUsd: true, durationMs: true },
      orderBy: { _count: { _all: "desc" } }, take: 25,
    }),
    prisma.generationTrace.groupBy({
      by: ["userId"], where,
      _count: { _all: true }, _sum: { durationMs: true, costUsd: true },
      orderBy: { _count: { _all: "desc" } }, take: 20,
    }),
    prisma.generationTrace.findMany({ where, orderBy: { createdAt: "desc" }, take: 40,
      select: { id: true, stage: true, operation: true, status: true, projectId: true, userId: true,
        provider: true, model: true, durationMs: true, costUsd: true, inputTokens: true,
        outputTokens: true, createdAt: true } }),
    prisma.project.findMany({ where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" }, take: 25,
      select: { id: true, title: true, userId: true, status: true, createdAt: true, renderUrl: true,
        durationSeconds: true, cuts: true, _count: { select: { scenes: true } } } }),
    prisma.project.aggregate({ where: { createdAt: { gte: since } },
      _sum: { durationSeconds: true } }),
    prisma.researchSession.groupBy({ by: ["status"], where: { createdAt: { gte: since } },
      _count: { _all: true } }),
    prisma.project.groupBy({ by: ["userId"], where: { createdAt: { gte: since } },
      _count: { _all: true }, orderBy: { _count: { _all: "desc" } }, take: 30 }),
    prisma.renderCredit.groupBy({ by: ["userId"], where: { createdAt: { gte: since } },
      _count: { _all: true }, orderBy: { _count: { _all: "desc" } }, take: 30 }),
  ]);
  const usageByUser = new Map();
  for (const group of topUsers) if (group.userId) usageByUser.set(group.userId, {
    userId: group.userId, operations: group._count._all,
    totalDurationMs: group._sum.durationMs || 0,
    measuredCostUsd: group._sum.costUsd == null ? null : Number(group._sum.costUsd),
    newProjects: 0, renderCredits: 0,
  });
  for (const group of projectUsers) {
    const row = usageByUser.get(group.userId) || { userId: group.userId, operations: 0,
      totalDurationMs: 0, measuredCostUsd: null, newProjects: 0, renderCredits: 0 };
    row.newProjects = group._count._all; usageByUser.set(group.userId, row);
  }
  for (const group of creditUsers) {
    const row = usageByUser.get(group.userId) || { userId: group.userId, operations: 0,
      totalDurationMs: 0, measuredCostUsd: null, newProjects: 0, renderCredits: 0 };
    row.renderCredits = group._count._all; usageByUser.set(group.userId, row);
  }
  const rankedUsers = [...usageByUser.values()].sort((a,b) =>
    (b.operations + b.newProjects + b.renderCredits) - (a.operations + a.newProjects + a.renderCredits)
    || a.userId.localeCompare(b.userId)).slice(0, 30);
  const ids = [...new Set([...rankedUsers.map(x => x.userId), ...recent.map(x => x.userId), ...recentProjects.map(x => x.userId)].filter(Boolean))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } },
    select: { id: true, email: true, displayName: true } }) : [];
  const usersById = Object.fromEntries(people.map((u) => [u.id, { email: u.email, name: u.displayName }]));
  return {
    collectedAt: new Date().toISOString(), days, since: since.toISOString(),
    definitions: {
      scope: "Projects and research sessions created during the period; generation traces measured during the period.",
      historical: "Legacy records do not contain precise stage execution times or API spend.",
      costs: "Only provider-reported or verified-invoice costs are counted. Unmeasured expenses are unknown, not zero.",
      rendering: "Final MP4 rendering currently runs in Lightsail API. This is not GPU workload accounting.",
    },
    totals: {
      registeredUsersAllTime: users,
      newProjects: projects,
      projectsWithRenderUrl: rendered,
      researchSessions: sessions,
      renderCredits: credits,
      generationOperations: traces,
      costMeasuredOperations: knownCosts,
      costUnmeasuredOperations: Math.max(0, traces - knownCosts),
      verifiedCostUsd: knownCosts ? Number(verifiedSpend._sum.costUsd || 0) : null,
      scriptedSeconds: Number(durationProjects._sum.durationSeconds || 0),
    },
    stages: summarizeGroups(stages),
    providers: providers.map((p) => ({
      provider: p.provider || "Unspecified", model: p.model || "Unspecified",
      operations: p._count._all,
      measuredCostUsd: p._sum.costUsd == null ? null : Number(p._sum.costUsd),
      totalDurationMs: p._sum.durationMs || 0,
    })),
    users: rankedUsers.map((g) => ({
      ...g, user: usersById[g.userId] || null,
    })),
    recentOperations: recent.map((r) => ({
      ...r, costUsd: r.costUsd == null ? null : Number(r.costUsd),
      user: usersById[r.userId] || null,
    })),
    recentProjects: recentProjects.map((p) => ({
      ...p, durationSeconds: p.durationSeconds == null ? null : Number(p.durationSeconds),
      sceneCount: p._count.scenes, _count: undefined,
      hasRender: Boolean(p.renderUrl), renderUrl: undefined,
      user: usersById[p.userId] || null,
    })),
    researchByStatus: researchByStatus.map((s) => ({ status: s.status, count: s._count._all })),
  };
}
