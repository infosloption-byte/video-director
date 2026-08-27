import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { renderProject } from "../services/renderService.js";

const QUEUE_NAME = "helix-render";
let queue = null;
let worker = null;

function redisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

function queueConnectionOptions() {
  const url = redisUrl();
  if (!url) throw new Error("Render queue is not configured. Set REDIS_URL in server/.env.");
  return {
    url,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    retryStrategy: () => null,
  };
}

function workerConnection() {
  const url = redisUrl();
  if (!url) throw new Error("Render queue is not configured. Set REDIS_URL in server/.env.");
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
    retryStrategy: (times) => Math.min(Math.max(times * 1000, 1000), 10000),
  });
}

export function getRenderQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: queueConnectionOptions() });
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

async function canReachRedis() {
  const url = redisUrl();
  if (!url) return false;
  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    client.disconnect();
    return false;
  }
}

export async function startRenderWorker() {
  if (worker) return worker;
  if (!redisUrl()) {
    console.log("[render] Redis is not configured; render worker is disabled.");
    return null;
  }

  const available = await canReachRedis();
  if (!available) {
    console.warn("[render] Redis is unavailable; render worker is disabled for this process. Start Redis and run `npm run render:worker` again.");
    return null;
  }

  const connection = workerConnection();
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
    { connection, concurrency: 1 },
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
  startRenderWorker().catch((error) => {
    console.error(`[render] Worker startup failed: ${error.message}`);
  });
}
