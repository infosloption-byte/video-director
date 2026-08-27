import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { renderProject } from "../services/renderService.js";

const QUEUE_NAME = "helix-render";
let queue = null;
let worker = null;

function connectionOptions() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("Render queue is not configured. Set REDIS_URL in server/.env.");
  }
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export function getRenderQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: connectionOptions() });
  return queue;
}

export async function enqueueRender(projectId) {
  const renderQueue = getRenderQueue();
  const job = await renderQueue.add(
    "render-project",
    { projectId },
    {
      jobId: projectId,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
      attempts: 1,
    },
  );
  return job;
}

export function startRenderWorker() {
  if (worker) return worker;
  if (!process.env.REDIS_URL?.trim()) {
    console.log("[render] Redis is not configured; render worker is disabled.");
    return null;
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { projectId } = job.data;
      await job.updateProgress(5);
      await prisma.project.update({ where: { id: projectId }, data: { status: "rendering" } });
      await job.updateProgress(15);
      const result = await renderProject(projectId);
      await job.updateProgress(100);
      return result;
    },
    { connection: connectionOptions(), concurrency: 1 },
  );

  worker.on("completed", (job) => console.log(`[render] Job ${job.id} completed.`));
  worker.on("failed", async (job, error) => {
    console.error(`[render] Job ${job?.id || "unknown"} failed:`, error);
    if (job?.data?.projectId) {
      await prisma.project.update({ where: { id: job.data.projectId }, data: { status: "finalize" } }).catch(() => {});
    }
  });
  worker.on("error", (error) => console.error("[render] Worker error:", error));

  console.log("[render] BullMQ worker started.");
  return worker;
}

if (process.argv[1] && process.argv[1].endsWith("renderQueue.js")) {
  startRenderWorker();
}
