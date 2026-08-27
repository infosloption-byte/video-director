import "dotenv/config";
import cron from "node-cron";
import { scrapeAndStoreSuggestedSignals } from "../services/signalFeedService.js";

const SCHEDULE = "0 */4 * * *";

export async function runSignalScrape() {
  try {
    return await scrapeAndStoreSuggestedSignals();
  } catch (error) {
    console.error("[signals] Suggested feed scrape failed:", error);
    return null;
  }
}

export function startSignalScraper() {
  const task = cron.schedule(SCHEDULE, () => {
    void runSignalScrape();
  });

  console.log(`[signals] Scheduled suggested feed scrape every 4 hours (${SCHEDULE}).`);

  // Keep startup deterministic. A temporary RSS/API outage should not delay
  // or destabilize the API used by the frontend. Set this to "true" when an
  // immediate refresh on boot is desired.
  if (process.env.SIGNALS_SCRAPE_ON_START === "true") {
    void runSignalScrape();
  }

  return task;
}

if (process.argv[1]?.endsWith("scrapeSignals.js")) {
  await runSignalScrape();
}
