import { Router } from "express";
import { prisma } from "../db/client.js";

const router = Router();

function available(review) { return review && !review.revokedAt && (!review.expiresAt || review.expiresAt >= new Date()); }

router.get("/projects/review/:token", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token }, include: { project: { select: { id: true, title: true, durationSeconds: true, editor: { select: { version: true, timeline: true, updatedAt: true } } } }, comments: { orderBy: { createdAt: "asc" } } } });
  if (!available(review)) return res.status(404).json({ error: "Review link is unavailable." });
  res.json({ review: { id: review.id, project: review.project, comments: review.comments } });
});

router.post("/projects/review/:token/comments", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token } });
  if (!available(review)) return res.status(404).json({ error: "Review link is unavailable." });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comment cannot be empty." });
  const comment = await prisma.projectReviewComment.create({ data: { reviewLinkId: review.id, authorName: String(req.body?.authorName || "Reviewer").slice(0, 120), body: body.slice(0, 2000) } });
  res.status(201).json({ comment });
});

router.patch("/projects/review/:token/comments/:commentId", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token } });
  if (!available(review)) return res.status(404).json({ error: "Review link is unavailable." });
  const comment = await prisma.projectReviewComment.findFirst({ where: { id: req.params.commentId, reviewLinkId: review.id } });
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  const updated = await prisma.projectReviewComment.update({ where: { id: comment.id }, data: { resolved: req.body?.resolved == null ? comment.resolved : Boolean(req.body.resolved) } });
  res.json({ comment: updated });
});

export default router;
