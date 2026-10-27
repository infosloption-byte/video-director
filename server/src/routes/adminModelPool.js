import { Router } from "express";
import { ModelPoolError } from "../services/modelPoolValidation.js";
import { listPool, createPoolModel, updatePoolModel, testPoolCapability } from "../services/modelPoolService.js";

const router = Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store, private"); next(); });
function handler(fn, status = 200) {
  return async (req, res) => {
    try { res.status(status).json(await fn(req)); }
    catch (error) {
      if (!(error instanceof ModelPoolError)) console.error("[admin/model-pool] operation failed", error?.name || "Error");
      res.status(error instanceof ModelPoolError ? error.status : 500).json({
        error: error instanceof ModelPoolError ? error.message : "Model Pool operation failed.",
      });
    }
  };
}
router.get("/", handler(async () => listPool()));
router.post("/", handler(async req => ({ model: await createPoolModel(req.body, req.user.id) }), 201));
router.put("/:modelId", handler(async req => ({
  model: await updatePoolModel(req.params.modelId, req.body, req.user.id),
})));
router.post("/:modelId/test/:capability", handler(async req => ({
  ...(await testPoolCapability(req.params.modelId, req.params.capability, req.user.id)),
}), 201));
export default router;
