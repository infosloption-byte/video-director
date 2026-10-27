import { Router } from "express";
import { pipelineCatalog, validatePipelineDefinition } from "../services/pipelineRegistry.js";
import { runPipelineSandbox, pipelineSandboxHistory } from "../services/pipelineSandboxService.js";
import { PipelineProblem, listPipelines, createPipeline, createDraft, updateDraft, publishVersion, activateVersion } from "../services/pipelineService.js";

const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store, private"); next(); });

function execute(action, successStatus = 200) {
  return async (req, res) => {
    try { res.status(successStatus).json(await action(req)); }
    catch (error) {
      if (!(error instanceof PipelineProblem)) console.error("[admin/pipelines] request failed", error);
      res.status(error instanceof PipelineProblem ? error.status : 500).json({
        error: error instanceof PipelineProblem ? error.message : "Pipeline request failed.",
        ...(error instanceof PipelineProblem ? { details: error.details } : {}),
      });
    }
  };
}
router.get("/catalog", execute(async () => pipelineCatalog()));
router.get("/", execute(async () => listPipelines()));
router.post("/", execute(async req => ({ pipeline: await createPipeline(req.body, req.user.id) }), 201));
router.post("/:pipelineId/drafts", execute(async req => ({ version: await createDraft(req.params.pipelineId, req.user.id) }), 201));
router.put("/:pipelineId/versions/:versionId", execute(async req =>
  updateDraft(req.params.versionId, req.params.pipelineId, req.body?.definition, req.user.id)));
router.post("/:pipelineId/versions/:versionId/validate", execute(async req => ({
  validation: validatePipelineDefinition(req.body?.definition, { allowPlanned: true }),
})));
router.post("/:pipelineId/versions/:versionId/sandbox-tests", execute(async req =>
  runPipelineSandbox(req.params.pipelineId, req.params.versionId, req.user.id), 201));
router.get("/:pipelineId/versions/:versionId/sandbox-tests", execute(async req =>
  pipelineSandboxHistory(req.params.pipelineId, req.params.versionId)));
router.post("/:pipelineId/versions/:versionId/publish", execute(async req =>
  publishVersion(req.params.versionId, req.params.pipelineId, req.user.id)));
router.post("/:pipelineId/versions/:versionId/activate", execute(async req =>
  activateVersion(req.params.versionId, req.params.pipelineId, req.user.id)));
export default router;
