import { Router } from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import { authOptional, clearSessionCookie } from "../middleware/auth.js";
import { verifyPassword } from "../services/passwordService.js";
import { sendSecurityEmail } from "../services/emailService.js";
import { deleteTtsVoice } from "../services/ttsService.js";
import { deleteVoiceProfileFiles } from "../services/voiceProfileService.js";
import { mergePreferences, resolvePreferences, alertsEnabled } from "../services/preferences.js";

export const accountRouter = Router();
const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

accountRouter.use(authOptional, (req, res, next) => {
  if (!req.user?.id) return res.status(401).json({ error: "Authentication required." });
  return next();
});

accountRouter.get("/preferences", (req, res) => res.json({ preferences: resolvePreferences(req.user.preferences) }));

accountRouter.patch("/preferences", async (req, res, next) => {
  try {
    const result = mergePreferences(req.user.preferences, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    await prisma.user.update({ where: { id: req.user.id }, data: { preferences: result.value } });
    return res.json({ preferences: result.value });
  } catch (error) { return next(error); }
});

// ---- Sessions ----------------------------------------------------------------------------------
accountRouter.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await prisma.authSession.findMany({
      where: { userId: req.user.id, expiresAt: { gt: new Date() } },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, expiresAt: true },
    });
    return res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.authSession?.id })) });
  } catch (error) { return next(error); }
});

accountRouter.delete("/sessions/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.authSession?.id) return res.status(400).json({ error: "Use Sign out to end this session." });
    const result = await prisma.authSession.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!result.count) return res.status(404).json({ error: "Session not found." });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

accountRouter.post("/sessions/revoke-others", async (req, res, next) => {
  try {
    const result = await prisma.authSession.deleteMany({ where: { userId: req.user.id, id: { not: req.authSession?.id || undefined } } });
    if (result.count && alertsEnabled(req.user)) void sendSecurityEmail(req.user, "sessions").catch((e) => console.error("[mail] Session notice failed:", e.message));
    return res.json({ ok: true, revoked: result.count });
  } catch (error) { return next(error); }
});

// ---- Data export -------------------------------------------------------------------------------
accountRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [projects, voiceProfiles, templates, subscription] = await Promise.all([
      prisma.project.findMany({ where: { userId }, select: { id: true, title: true, status: true, researchSummary: true, researchSources: true, scriptLengthSeconds: true, selectedFramework: true, createdAt: true } }),
      prisma.voiceProfile.findMany({ where: { userId }, select: { id: true, name: true, status: true, language: true, createdAt: true, consentAcceptedAt: true, consentNoticeVersion: true } }),
      prisma.projectTemplate.findMany({ where: { userId } }),
      prisma.billingSubscription.findUnique({ where: { userId }, select: { plan: true, status: true, periodEnd: true, cancelAtPeriodEnd: true } }),
    ]);
    const u = req.user;
    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt, termsAcceptedAt: u.termsAcceptedAt, termsVersion: u.termsVersion, adultConfirmedAt: u.adultConfirmedAt },
      preferences: resolvePreferences(u.preferences),
      subscription,
      projects, voiceProfiles, templates,
      note: "Generated media files (audio, renders) are not included in this export; download them from each project.",
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="voxora-data-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) { return next(error); }
});

// ---- Delete account ----------------------------------------------------------------------------
async function removeProject(projectId) {
  await prisma.$transaction(async (tx) => {
    const scenes = await tx.projectScene.findMany({ where: { projectId }, select: { id: true } });
    if (scenes.length) await tx.sceneAsset.deleteMany({ where: { sceneId: { in: scenes.map((s) => s.id) } } });
    await tx.projectScene.deleteMany({ where: { projectId } });
    await tx.projectExport.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
  await Promise.all(["audio", "render-assets", "renders", "exports"].map((dir) => rm(path.join(STORAGE_ROOT, dir, projectId), { recursive: true, force: true }).catch(() => {})));
}

accountRouter.post("/delete", async (req, res, next) => {
  try {
    const { password, confirm } = req.body || {};
    if (String(confirm || "").trim().toUpperCase() !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.passwordHash || typeof password !== "string" || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Password is incorrect." });
    }
    const subscription = await prisma.billingSubscription.findUnique({ where: { userId: user.id } });
    if (subscription && ["active", "trialing", "past_due", "paused"].includes(subscription.status)) {
      return res.status(409).json({ error: "Cancel your subscription from Billing before deleting your account." });
    }
    const projects = await prisma.project.findMany({ where: { userId: user.id }, select: { id: true, status: true } });
    if (projects.some((p) => p.status === "rendering")) return res.status(409).json({ error: "A project is still rendering. Wait for it to finish, then try again." });

    const profiles = await prisma.voiceProfile.findMany({ where: { userId: user.id }, select: { id: true, ttsVoiceId: true } });
    for (const profile of profiles) {
      if (profile.ttsVoiceId) {
        try { await deleteTtsVoice(profile.ttsVoiceId); }
        catch (error) {
          console.error("[account] Remote voice deletion failed", { profileId: profile.id, status: error.providerStatus || null });
          return res.status(503).json({ error: "We could not remove your cloned voices from the voice service. Nothing was deleted; please try again shortly." });
        }
      }
      await deleteVoiceProfileFiles(profile.id).catch(() => {});
    }
    for (const project of projects) await removeProject(project.id);

    await prisma.user.delete({ where: { id: user.id } });
    void sendSecurityEmail(user, "deleted").catch((e) => console.error("[mail] Deletion notice failed:", e.message));
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});
