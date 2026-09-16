import cors from "cors";
import express from "express";
import path from "node:path";
import signalsRouter from "./routes/signals.js";
import projectsRouter from "./routes/projects.js";
import researchRouter from "./routes/research.js";
import researchControlRouter from "./routes/researchControl.js";
import researchConversationsRouter from "./routes/researchConversations.js";
import projectDeleteRouter from "./routes/projectDelete.js";
import editorRouter from "./routes/editor.js";
import productivityRouter from "./routes/productivity.js";
import reviewRouter from "./routes/review.js";
import templatesRouter from "./routes/templates.js";
import mediaRouter from "./routes/media.js";
import mediaProxyRouter from "./routes/mediaProxy.js";
import renderMediaRouter from "./routes/renderMedia.js";
import storyboardRouter from "./routes/storyboard.js";
import renderRouter from "./routes/render.js";
import editorRenderRouter from "./routes/editorRender.js";
import exportRouter from "./routes/export.js";
import authRouter from "./routes/auth.js";
import { authOptional, getRequestUserId, requireAuth } from "./middleware/auth.js";
import { requireProjectOwner, requireSceneOwner } from "./middleware/ownership.js";
import { requireRenderAssetAccess, requireStoredProjectOwner } from "./middleware/storageOwnership.js";
import { sameOriginProtection } from "./middleware/csrf.js";
import { expensiveOperationRateLimit } from "./middleware/rateLimit.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(authOptional);
app.use(sameOriginProtection);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Reports which external integrations are configured, without exposing key
// material. Every step of the Signals→Video and Chat Research→Video
// pipelines depends on one or more of these; a missing key doesn't crash
// anything (most fail gracefully), it just silently produces a degraded
// result (e.g. zero research sources, no narration, no B-roll). Surfacing
// this here lets the frontend warn a user or admin upfront instead of
// discovering it mid-flow.
app.get("/api/health/integrations", (_req, res) => {
  const configured = (name) => Boolean(String(process.env[name] || "").trim());
  const integrations = {
    gemini: { configured: configured("GEMINI_API_KEY"), usedFor: "Research synthesis, scene/script writing, AI editing" },
    tavily: { configured: configured("TAVILY_API_KEY"), usedFor: "Research source discovery" },
    brave: { configured: configured("BRAVE_API_KEY"), usedFor: "Research source discovery" },
    elevenlabs: { configured: configured("ELEVENLABS_API_KEY"), usedFor: "Narration (text-to-speech)" },
    pexels: { configured: configured("PEXELS_API_KEY"), usedFor: "B-roll visuals" },
    facebook: { configured: configured("FACEBOOK_PAGE_ACCESS_TOKEN") && configured("FACEBOOK_PAGE_ID"), usedFor: "Publish to Facebook" },
  };
  const searchConfigured = integrations.tavily.configured || integrations.brave.configured;
  const warnings = [];
  if (!searchConfigured) warnings.push("Neither TAVILY_API_KEY nor BRAVE_API_KEY is set — research will find zero sources.");
  if (!integrations.gemini.configured) warnings.push("GEMINI_API_KEY is not set — research synthesis and scene generation will fail.");
  if (!integrations.elevenlabs.configured) warnings.push("ELEVENLABS_API_KEY is not set — narration generation will fail.");
  if (!integrations.pexels.configured) warnings.push("PEXELS_API_KEY is not set — B-roll selection will fail.");
  res.json({ integrations, searchConfigured, warnings });
});
app.use("/api/auth", authRouter);
app.use("/api/signals", expensiveOperationRateLimit, signalsRouter);
app.use("/api", reviewRouter);
app.use("/api/research-conversations", requireAuth, expensiveOperationRateLimit, researchConversationsRouter);

app.use("/api/projects", requireAuth, (req, _res, next) => {
  const userId = getRequestUserId(req);
  if (userId) req.query.userId = userId;
  if (req.body && typeof req.body === "object") req.body.userId = userId;
  next();
}, requireProjectOwner, expensiveOperationRateLimit);
app.use("/api/templates", requireAuth, templatesRouter);
app.use("/api/projects", requireAuth, requireProjectOwner, projectDeleteRouter);
app.use("/api/projects", editorRouter);
app.use("/api/projects", productivityRouter);
app.use("/api/projects", mediaRouter);
app.use("/api/projects", mediaProxyRouter);
app.use("/api/projects", researchControlRouter);
app.use("/api/projects", researchRouter);
app.use("/api/projects", projectsRouter);

app.use("/api/render-media", requireRenderAssetAccess, renderMediaRouter);
app.use("/api/render-assets", requireRenderAssetAccess, express.static(path.resolve(process.cwd(), "storage", "render-assets"), { fallthrough: false, maxAge: "1h" }));
app.use("/api/audio", requireRenderAssetAccess, express.static(path.resolve(process.cwd(), "storage", "audio"), { fallthrough: false, maxAge: "1h" }));
for (const [route, directory] of [["/api/render-files", "renders"], ["/api/export-files", "exports"]]) app.use(route, requireAuth, requireStoredProjectOwner, express.static(path.resolve(process.cwd(), "storage", directory), { fallthrough: false, maxAge: "1h" }));
app.use("/api/scenes/:sceneId", requireAuth, requireSceneOwner);
app.use("/api", requireAuth, expensiveOperationRateLimit, editorRenderRouter);
app.use("/api", requireAuth, expensiveOperationRateLimit, renderRouter);
app.use("/api", requireAuth, storyboardRouter);
app.use("/api", requireAuth, exportRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
export default app;
