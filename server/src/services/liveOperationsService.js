import { prisma } from "../db/client.js";
import { getRenderQueue } from "../jobs/renderQueue.js";
import { getEditorRenderQueue } from "../jobs/editorRenderQueue.js";

async function queueStatus(queueFactory, type) {
  if (!process.env.REDIS_URL?.trim()) return { type, available: false, reason: "Render Redis is not configured", jobs: [] };
  try {
    const queue = queueFactory();
    const [counts, jobs] = await Promise.all([
      queue.getJobCounts("active", "waiting", "failed", "completed", "delayed"),
      queue.getJobs(["active", "waiting", "delayed"], 0, 19),
    ]);
    return {
      type, available: true, counts,
      jobs: await Promise.all(jobs.map(async (job) => {
        const state = await job.getState().catch(() => "unknown");
        const raw = job.progress;
        const progress = raw && typeof raw === "object" ? raw : { progress: Number(raw || 0) };
        return {
          jobId: String(job.id || "").slice(0, 120),
          state,
          progress: Math.min(100, Math.max(0, Number(progress.progress || 0))),
          stage: String(progress.stage || "queued").slice(0, 50),
          stageProgress: Math.min(100, Math.max(0, Number(progress.stageProgress || 0))),
          elapsedSeconds: Number(progress.elapsedSeconds || 0) || null,
          queuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        };
      })),
    };
  } catch (error) {
    console.warn("[admin-analytics] Queue snapshot unavailable:", error?.code || error?.message);
    return { type, available: false, reason: "Queue status unavailable", jobs: [] };
  }
}
export async function getLiveOperations() {
  const [storyboard, editor, researching] = await Promise.all([
    queueStatus(getRenderQueue, "storyboard"),
    queueStatus(getEditorRenderQueue, "editor"),
    prisma.project.findMany({ where: { researchJobRunning: true },
      take: 25, select: { id: true, title: true, userId: true, createdAt: true } }),
  ]);
  return {
    collectedAt: new Date().toISOString(), refreshAfterSeconds: 20,
    queues: { storyboard, editor },
    researching: researching.map(({ id, title, userId, createdAt }) => ({
      projectId: id, title, userId, createdAt,
      status: "running (database flag)",
    })),
    note: "Queue state is live BullMQ data. Research in-progress flags may persist after an unexpected crash until recovery runs. This is Lightsail rendering, not GPU job scheduling.",
  };
}
