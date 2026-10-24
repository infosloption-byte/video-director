import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// The separate GPU TTS gateway is not deployed yet. Its legacy ElevenLabs/Qwen
// fallback expectations must not block validating the API's other functionality.
// Keep the full `npm test` command unchanged so TTS failures stay visible.
const excluded = new Set(["ttsFallback.test.js"]);
const files = readdirSync("test")
  .filter((filename) => filename.endsWith(".test.js") && !excluded.has(filename))
  .sort()
  .map((filename) => join("test", filename));

if (!files.length) {
  console.error("[test:core] No test files were found.");
  process.exit(1);
}
console.log("[test:core] TTS integration/legacy fallback suite excluded until GPU TTS configuration.");
console.log(`[test:core] Running ${files.length} backend test files. UI-only source checks may be skipped in a backend-only Docker image.`);
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
