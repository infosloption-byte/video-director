import "dotenv/config";
import app from "./app.js";
import { startSignalScraper } from "./jobs/scrapeSignals.js";
import { startRenderWorker } from "./jobs/renderQueue.js";
import { prisma } from "./db/client.js";

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Helix server listening on http://localhost:${PORT}`);
  // Signal scraping is deliberately opt-in at startup. A third-party feed
  // outage must never make the API unavailable while the UI is running.
  startSignalScraper();
  startRenderWorker();
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
