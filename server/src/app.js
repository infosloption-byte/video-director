import cors from "cors";
import express from "express";
import path from "node:path";
import signalsRouter from "./routes/signals.js";
import projectsRouter from "./routes/projects.js";
import projectDeleteRouter from "./routes/projectDelete.js";
import editorRouter from "./routes/editor.js";
import storyboardRouter from "./routes/storyboard.js";
import renderRouter from "./routes/render.js";
import exportRouter from "./routes/export.js";
import authRouter from "./routes/auth.js";
import { authOptional, getRequestUserId, requireAuth } from "./middleware/auth.js";
import { requireProjectOwner, requireSceneOwner } from "./middleware/ownership.js";
import { requireRenderAssetAccess, requireStoredProjectOwner } from "./middleware/storageOwnership.js";
import { sameOriginProtection } from "./middleware/csrf.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(authOptional);
app.use(sameOriginProtection);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/signals", signalsRouter);

// Bind every project request to the authenticated user. The temporary local-user
// fallback remains available only when DEV_AUTH_FALLBACK=true in development.
app.use("/api/projects", requireAuth, (req, _res, next) => {
  const userId = getRequestUserId(req);
  req.query.userId = userId;
  if (req.body && typeof req.body === "object") req.body.userId = userId;
  next();
}, requireProjectOwner);
app.use("/api/projects", projectDeleteRouter);
app.use("/api/projects", editorRouter);
app.use("/api/projects", projectsRouter);

// Render workers fetch cached B-roll without a browser session. That internal
// request is authorized with the server-only RENDER_ASSET_TOKEN when configured;
// browser requests still fall back to normal authenticated ownership checks.
app.use(
  "/api/render-assets",
  requireRenderAssetAccess,
  express.static(path.resolve(process.cwd(), "storage", "render-assets"), { fallthrough: false, maxAge: "1h" }),
);

// User-facing project media remains private and owner-scoped.
for (const [route, directory] of [
  ["/api/audio", "audio"],
  ["/api/render-files", "renders"],
  ["/api/export-files", "exports"],
]) {
  app.use(route, requireAuth, requireStoredProjectOwner, express.static(path.resolve(process.cwd(), "storage", directory), { fallthrough: false, maxAge: "1h" }));
}

app.use("/api/scenes/:sceneId", requireAuth, requireSceneOwner);
app.use("/api", requireAuth, renderRouter);
app.use("/api", requireAuth, storyboardRouter);
app.use("/api", requireAuth, exportRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
export default app;
