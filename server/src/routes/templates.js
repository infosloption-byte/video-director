import { Router } from "express";
import { prisma } from "../db/client.js";

const router = Router();
router.get("/", async (req, res) => { const templates = await prisma.projectTemplate.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: "desc" }, take: 100 }); res.json({ templates }); });
router.post("/", async (req, res) => { const name = String(req.body?.name || "").trim(); if (!name) return res.status(400).json({ error: "Template name is required." }); const template = await prisma.projectTemplate.create({ data: { userId: req.user.id, name: name.slice(0, 120), description: String(req.body?.description || "").slice(0, 500), timeline: req.body?.timeline || {} } }); res.status(201).json({ template }); });
router.delete("/:templateId", async (req, res) => { const template = await prisma.projectTemplate.findFirst({ where: { id: req.params.templateId, userId: req.user.id } }); if (!template) return res.status(404).json({ error: "Template not found." }); await prisma.projectTemplate.delete({ where: { id: template.id } }); res.status(204).end(); });
export default router;
