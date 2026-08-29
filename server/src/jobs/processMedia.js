import "dotenv/config";
import { processPendingMedia } from "../services/mediaProcessing.js";

try {
  await processPendingMedia();
  console.log("[media] pending proxy processing pass complete.");
} catch (error) {
  console.error(`[media] proxy processing failed: ${error.message}`);
  process.exitCode = 1;
}
