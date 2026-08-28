import { cleanupMediaStorage } from "../services/mediaCleanup.js";

const dryRun = process.argv.includes("--dry-run");

cleanupMediaStorage({ dryRun })
  .then((result) => {
    console.log(`[media] Cleanup ${dryRun ? "preview" : "completed"}: scanned ${result.scanned}, preserved ${result.preserved}, removed ${result.removed}.`);
    if (result.removedKeys.length) {
      console.log(`[media] Removed files:\n${result.removedKeys.map((key) => `- ${key}`).join("\n")}`);
    }
  })
  .catch((error) => {
    console.error(`[media] Cleanup failed: ${error.message}`);
    process.exitCode = 1;
  });
