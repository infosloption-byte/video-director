import { prisma } from "../db/client.js";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_INTERVAL_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findLatestResearchSession(projectId) {
  const session = await prisma.researchSession.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return session?.id || null;
}

export async function waitForResearchGraph(projectId, userId, { timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return { status: "missing" };

  const deadline = Date.now() + timeoutMs;
  let sessionId = await findLatestResearchSession(projectId);
  while (!sessionId && Date.now() < deadline) {
    await sleep(intervalMs);
    sessionId = await findLatestResearchSession(projectId);
  }
  if (!sessionId) return { status: "pending" };

  const session = await prisma.researchSession.findUnique({
    where: { id: sessionId },
    include: {
      plan: true,
      sources: { orderBy: { sourceIndex: "asc" } },
      evidence: { orderBy: { evidenceIndex: "asc" } },
      claims: {
        orderBy: { claimIndex: "asc" },
        include: {
          verification: true,
          sourceLinks: { include: { source: true } },
          evidenceLinks: { include: { evidence: true } },
        },
      },
      conflicts: { orderBy: { createdAt: "asc" } },
    },
  });

  return session ? { status: "ready", session } : { status: "pending" };
}
