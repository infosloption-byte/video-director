import { Router } from "express";
import { buildProjectExports, getProjectExportSummary } from "../services/exportService.js";

const router = Router();

router.get("/projects/:id/export", async (req, res) => {
  try {
    const result = await buildProjectExports(req.params.id);
    res.json(result);
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/export failed:`, error);
    res.status(409).json({ error: error.message || "Failed to build project exports." });
  }
});

router.get("/projects/:id/export-status", async (req, res) => {
  try {
    res.json(await getProjectExportSummary(req.params.id));
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/export-status failed:`, error);
    res.status(404).json({ error: error.message || "Failed to load export status." });
  }
});

export default router;
