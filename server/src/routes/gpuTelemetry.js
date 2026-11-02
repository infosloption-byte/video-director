import { timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "../db/client.js";
import { validateGpuSample } from "../services/infrastructureMonitoring.js";

const digest = value => createHash("sha256").update(String(value)).digest();
export async function receiveGpuTelemetry(req, res) {
  res.set("Cache-Control", "no-store");
  const expected = String(process.env.GPU_TELEMETRY_INGEST_TOKEN || "");
  if (expected.length < 32) return res.status(503).json({ error: "GPU telemetry intake is not configured." });
  const header = String(req.get("authorization") || "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(digest(expected), digest(supplied))) return res.status(401).json({ error: "Unauthorized." });
  try {
    const payload = JSON.stringify(req.body || {});
    if (payload.length > 1024) return res.status(413).json({ error: "Sample exceeds allowed size." });
    const sample = validateGpuSample(req.body);
    await prisma.infrastructureSample.create({ data: sample });
    return res.status(202).json({ accepted: true });
  } catch (error) {
    if (error.message?.startsWith("Invalid")) return res.status(400).json({ error: error.message });
    console.error("[monitor] GPU metrics storage failed:", error?.code || error?.message);
    return res.status(503).json({ error: "Unable to record telemetry." });
  }
}
