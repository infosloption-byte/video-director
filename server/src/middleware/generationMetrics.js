import { recordGenerationTrace } from "../services/generationTelemetry.js";

// Request wall time covers the synchronous HTTP operation, NOT queue execution.
// Never captures bodies, prompts, URLs, authorization headers or scene text.
const projectOperations = [
  { route: /^\/([^/]+)\/generate-scenes$/, stage: "storyboard", operation: "storyboard.generate" },
  { route: /^\/([^/]+)\/generate-voice$/, stage: "narration", operation: "narration.generate" },
  { route: /^\/([^/]+)\/repair-narration$/, stage: "narration", operation: "narration.repair" },
  { route: /^\/([^/]+)\/setup$/, stage: "other", operation: "project.setup" },
  { route: /^\/([^/]+)\/render$/, stage: "render", operation: "render.enqueue" },
  { route: /^\/([^/]+)\/export$/, stage: "export", operation: "export.prepare" },
];

export function classifyProjectOperation(method, path) {
  if (method !== "POST") return null;
  for (const candidate of projectOperations) {
    const match = candidate.route.exec(path);
    if (match && match[1].length <= 64) return { ...candidate, projectId: match[1], route: undefined };
  }
  return null;
}

export function captureProjectOperation(req, res, next) {
  const operation = classifyProjectOperation(req.method, req.path);
  if (!operation || !req.user?.id) return next();
  const startedAt = new Date();
  res.once("finish", () => {
    const finishedAt = new Date();
    void recordGenerationTrace({
      projectId: operation.projectId, userId: req.user.id,
      stage: operation.stage, operation: operation.operation,
      status: res.statusCode >= 400 ? "failed" : "completed",
      startedAt, finishedAt,
      metadata: { jobType: "http_request" },
    });
  });
  return next();
}
