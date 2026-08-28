import cors from "cors";
import express from "express";
import path from "node:path";
import signalsRouter from "./routes/signals.js";
import projectsRouter from "./routes/projects.js";
import projectDeleteRouter from "./routes/projectDelete.js";
import storyboardRouter from "./routes/storyboard.js";
import renderRouter from "./routes/render.js";
import exportRouter from "./routes/export.js";
import authRouter from "./routes/auth.js";
import { authOptional, requireAuth } from "./middleware/auth.js";
import { requireProjectOwner, requireSceneOwner } from "./middleware/ownership.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(authOptional);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/signals", signalsRouter);

// Workspace APIs are authenticated. In development, requireAuth intentionally
// resolves to the existing local-user identity unless AUTH_REQUIRED=true.
app.use("/api/projects", requireAuth, requireProjectOwner);
app.use("/api/projects", projectDeleteRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/audio", express.static(path.resolve(process.cwd(), "storage", "audio"), { fallthrough: false, maxAge: "1h" }));
app.use("/api/render-assets", express.static(path.resolve(process.cwd(), "storage", "render-assets"), { fallthrough: false, maxAge: "1h" }));
app.use("/api/render-files", express.static(path.resolve(process.cwd(), "storage", "renders"), { fallthrough: false, maxAge: "1h" }));
app.use("/api/export-files", express.static(path.resolve(process.cwd(), "storage", "exports"), { fallthrough: false, maxAge: "1h" }));
app.use("/api/scenes/:sceneId", requireAuth, requireSceneOwner);
app.use("/api", requireAuth, renderRouter);
app.use("/api", requireAuth, storyboardRouter);
app.use("/api", requireAuth, exportRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
export default app;
