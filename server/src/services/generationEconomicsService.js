import { prisma } from "../db/client.js";
import { reportWindow } from "./platformAnalyticsService.js";

function positiveRate(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value < 100000 ? value : null;
}
function groupState(user, plan) {
  return { userId: user, plan, projects: 0, rendered: 0,
    totalVideoSeconds: 0, tracedOperations: 0, costMeasuredOperations: 0,
    verifiedProviderCostUsd: null, computeAllocationUsd: null, billedRevenueUsd: null, marginUsd: null };
}

export function summarizeProjectEconomics(projects, traces, subscriptions, config = {}) {
  const rateRender = config.renderHourlyRate ?? null;
  const rateResearch = config.researchHourlyRate ?? null;
  const totals = { projects: 0, rendered: 0, outputSeconds: 0, tracedOperations: 0,
    verifiedCostOperations: 0, operationsWithoutVerifiedCost: 0,
    verifiedProviderCostUsd: null, estimatedComputeAllocationUsd: null, billedRevenueUsd: null, marginUsd: null };
  const planByUser = new Map(subscriptions.map(s => [s.userId, s.plan]));
  const byProject = new Map();
  for (const project of projects) {
    byProject.set(project.id, { projectId: project.id, userId: project.userId,
      title: project.title, createdAt: project.createdAt,
      plan: planByUser.get(project.userId) || "free_or_unknown",
      rendered: Boolean(project.renderUrl), outputSeconds: Number(project.durationSeconds || 0),
      tracedOperations: 0, costMeasuredOperations: 0, verifiedProviderCostUsd: null,
      estimatedComputeAllocationUsd: null, billedRevenueUsd: null, marginUsd: null });
  }
  for (const trace of traces) {
    const row = byProject.get(trace.projectId);
    if (!row) continue;
    row.tracedOperations++;
    if (trace.costUsd !== null && trace.costUsd !== undefined) {
      row.costMeasuredOperations++;
      row.verifiedProviderCostUsd = (row.verifiedProviderCostUsd || 0) + Number(trace.costUsd);
    }
    // Allocation by wall-clock work, NOT cloud invoice spend.
    const rate = trace.operation === "render.remotion" ? rateRender
      : trace.operation === "research.full" ? rateResearch : null;
    if (rate != null) {
      row.estimatedComputeAllocationUsd = (row.estimatedComputeAllocationUsd || 0) + rate * trace.durationMs / 3600000;
    }
  }
  const plans = new Map();
  const users = new Map();
  const values = [...byProject.values()];
  for (const row of values) {
    const user = users.get(row.userId) || groupState(row.userId, row.plan);
    const plan = plans.get(row.plan) || { ...groupState(null, row.plan) };
    for (const group of [user, plan]) {
      group.projects++;
      group.rendered += Number(row.rendered);
      group.totalVideoSeconds += row.outputSeconds;
      group.tracedOperations += row.tracedOperations;
      group.costMeasuredOperations += row.costMeasuredOperations;
      if (row.verifiedProviderCostUsd !== null)
        group.verifiedProviderCostUsd = (group.verifiedProviderCostUsd || 0) + row.verifiedProviderCostUsd;
      if (row.estimatedComputeAllocationUsd !== null)
        group.computeAllocationUsd = (group.computeAllocationUsd || 0) + row.estimatedComputeAllocationUsd;
    }
    users.set(row.userId, user); plans.set(row.plan, plan);
    totals.projects++; totals.rendered += Number(row.rendered);
    totals.outputSeconds += row.outputSeconds; totals.tracedOperations += row.tracedOperations;
    totals.verifiedCostOperations += row.costMeasuredOperations;
    if (row.verifiedProviderCostUsd !== null)
      totals.verifiedProviderCostUsd = (totals.verifiedProviderCostUsd || 0) + row.verifiedProviderCostUsd;
    if (row.estimatedComputeAllocationUsd !== null)
      totals.estimatedComputeAllocationUsd = (totals.estimatedComputeAllocationUsd || 0) + row.estimatedComputeAllocationUsd;
  }
  totals.operationsWithoutVerifiedCost = totals.tracedOperations - totals.verifiedCostOperations;
  return { totals, projects: values, users: [...users.values()], plans: [...plans.values()] };
}

export async function getGenerationEconomics(daysValue) {
  const { since, days } = reportWindow(daysValue);
  const projects = await prisma.project.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, title: true, userId: true, createdAt: true, renderUrl: true, durationSeconds: true },
    orderBy: { createdAt: "desc" }, take: 150,
  });
  const projectIds = projects.map(p => p.id);
  const userIds = [...new Set(projects.map(p => p.userId))];
  const [traces, subscriptions] = await Promise.all([
    projectIds.length ? prisma.generationTrace.findMany({
      where: { projectId: { in: projectIds }, createdAt: { gte: since } },
      select: { projectId: true, operation: true, durationMs: true, costUsd: true }, take: 5000,
    }) : [],
    userIds.length ? prisma.billingSubscription.findMany({
      where: { userId: { in: userIds } }, select: { userId: true, plan: true },
    }) : [],
  ]);
  return {
    days, collectedAt: new Date().toISOString(),
    coverage: {
      projectSampleLimit: 150, operationSampleLimit: 5000,
      projectsReturned: projects.length, tracesReturned: traces.length,
      possibleTruncation: projects.length === 150 || traces.length === 5000,
      plan: "Current billing plan; may differ from plan when a historical operation occurred.",
      revenue: "No reconciled per-user Paddle net revenue ledger exists; revenue and margin remain unknown.",
      infrastructure: "Operator-supplied USD/hour rates are optional nominal wall-time allocations, not measured AWS charges.",
      providerCosts: "Only actual provider-reported or invoice-verified costs; unknown does not mean zero.",
    },
    rates: {
      renderHourlyRate: positiveRate("LIGHTSAIL_RENDER_ALLOCATION_USD_PER_HOUR"),
      researchHourlyRate: positiveRate("LIGHTSAIL_RESEARCH_ALLOCATION_USD_PER_HOUR"),
    },
    ...summarizeProjectEconomics(projects, traces, subscriptions, {
      renderHourlyRate: positiveRate("LIGHTSAIL_RENDER_ALLOCATION_USD_PER_HOUR"),
      researchHourlyRate: positiveRate("LIGHTSAIL_RESEARCH_ALLOCATION_USD_PER_HOUR"),
    }),
  };
}
