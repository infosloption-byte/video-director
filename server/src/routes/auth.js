import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../db/client.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { authOptional, clearSessionCookie, setSessionCookie } from "../middleware/auth.js";
import { emailReady, sendVerificationEmail, sendResetEmail, sendSecurityEmail } from "../services/emailService.js";
import { CURRENT_LEGAL_VERSION } from "../services/legalConsent.js";
import { normalizeIntendedPlan } from "../services/onboardingPlan.js";
import { resolvePreferences, alertsEnabled } from "../services/preferences.js";
import { isRegistrationOpen } from "../services/platformConfigService.js";

const router = Router();
const SESSION_DAYS = 30;
const TOKEN_HOURS = 2;
const EMAIL_TOKEN_HOURS = 24;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;
const CODE_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const resetLimiter = new Map();
const codeAttempts = new Map();
const resendAt = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && value.length <= 200;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role === "platform_admin" ? "platform_admin" : "user",
    email: user.email,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt,
    planSelectedAt: user.planSelectedAt || null,
    intendedPlan: user.planSelectedAt ? null : normalizeIntendedPlan(user.intendedPlan),
    preferences: resolvePreferences(user.preferences),
    termsAcceptedAt: user.termsAcceptedAt || null,
    termsVersion: user.termsVersion || null,
    adultConfirmedAt: user.adultConfirmedAt || null,
    createdAt: user.createdAt,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function codeHash(userId, code) {
  return hashToken(`${userId}:${code}`);
}

// Issue a new link and code without revoking a previously delivered code if
// Gmail fails. No resend cooldown is imposed unless the message was accepted.
async function issueVerification(user) {
  const linkToken = randomToken();
  const code = generateCode();
  const newHashes = [hashToken(linkToken), codeHash(user.id, code)];
  await prisma.authToken.createMany({ data: [
    { userId: user.id, kind: "email_verification", tokenHash: newHashes[0], expiresAt: new Date(Date.now() + EMAIL_TOKEN_HOURS * 3600000) },
    { userId: user.id, kind: "email_code", tokenHash: newHashes[1], expiresAt: new Date(Date.now() + CODE_MINUTES * 60000) },
  ] });
  try {
    const sent = await sendVerificationEmail(user, linkToken, code);
    if (!sent) throw new Error("Email delivery is unavailable.");
  } catch (error) {
    await prisma.authToken.deleteMany({ where: { userId: user.id, tokenHash: { in: newHashes } } }).catch(() => {});
    throw error;
  }
  await prisma.authToken.deleteMany({
    where: { userId: user.id, kind: { in: ["email_verification", "email_code"] }, tokenHash: { notIn: newHashes } },
  });
  codeAttempts.delete(user.id);
  resendAt.set(user.id, Date.now());
  return true;
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function rateLimitByIp(req, key, limit, windowMs) {
  const id = `${key}:${req.ip || req.socket.remoteAddress || "unknown"}`;
  const now = Date.now();
  const existing = resetLimiter.get(id);
  if (!existing || now - existing.startedAt > windowMs) {
    resetLimiter.set(id, { startedAt: now, count: 1 });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

async function createSession(userId, req) {
  const raw = randomToken();
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 255) || null,
    },
  });
  return raw;
}

function requireUser(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: "Authentication required." });
  return next();
}

router.get("/me", authOptional, async (req, res) => {
  if (req.user) return res.json({ authenticated: true, user: publicUser(req.user) });
  return res.json({ authenticated: false, user: null });
});

router.post("/signup", async (req, res, next) => {
  try {
    if (!(await isRegistrationOpen())) return res.status(503).json({ code: "REGISTRATION_CLOSED", error: "New registrations are temporarily paused." });
    if (process.env.NODE_ENV === "production" && !emailReady()) return res.status(503).json({ error: "Signups are temporarily unavailable." });
    if (!rateLimitByIp(req, "signup", 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-up attempts. Please try again later." });
    const email = normalizeEmail(req.body?.email);
    const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
    const password = req.body?.password;
    const intendedPlan = normalizeIntendedPlan(req.body?.intendedPlan);
    if (req.body?.intendedPlan != null && !intendedPlan) return res.status(400).json({ error: "Invalid subscription plan selection." });
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!validPassword(password)) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    if (req.body?.adultConfirmed !== true) return res.status(400).json({ error: "You must be at least 18 to create a Voxora account." });
    if (req.body?.termsAccepted !== true) return res.status(400).json({ error: "Read and accept the Terms & Conditions and Privacy Policy." });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const user = await prisma.user.create({ data: { email, displayName: displayName || null, passwordHash: await hashPassword(password), termsAcceptedAt: new Date(), termsVersion: CURRENT_LEGAL_VERSION, adultConfirmedAt: new Date(), intendedPlan } });
    const sessionToken = await createSession(user.id, req);
    setSessionCookie(res, sessionToken);
    let emailSent = false;
    try { emailSent = await issueVerification(user); } catch (error) { console.error("[auth] Signup verification email failed:", error.message); }
    return res.status(201).json({ user: publicUser(user), emailVerificationRequired: true, emailSent, message: emailSent ? "We emailed you a 6-digit code." : "Account created, but delivery failed. Request a new code from the verification page." });
  } catch (error) {
    return next(error);
  }
});

router.post("/signin", async (req, res, next) => {
  try {
    if (!rateLimitByIp(req, "signin", 12, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== "string") return res.status(400).json({ error: "Enter your email and password." });
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!valid) return res.status(401).json({ error: "Email or password is incorrect." });
    const sessionToken = await createSession(user.id, req);
    setSessionCookie(res, sessionToken);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/signout", authOptional, async (req, res, next) => {
  try {
    if (req.authSession) await prisma.authSession.delete({ where: { id: req.authSession.id } }).catch(() => {});
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-email", async (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) return res.status(400).json({ error: "Verification token is required." });
  const authToken = await prisma.authToken.findFirst({ where: { kind: "email_verification", tokenHash: hashToken(token), expiresAt: { gt: new Date() } } });
  if (!authToken) return res.status(400).json({ error: "This verification link is invalid or expired." });
  const user = await prisma.user.update({ where: { id: authToken.userId }, data: { emailVerifiedAt: new Date() } });
  await prisma.authToken.deleteMany({ where: { userId: user.id, kind: { in: ["email_verification", "email_code"] } } });
  void sendSecurityEmail(user, "verified").catch((error) => console.error("[mail] Verification confirmation failed:", error.message));
  return res.json({ user: publicUser(user) });
});

router.post("/verify-code", authOptional, requireUser, async (req, res, next) => {
  try {
    if (req.user.emailVerifiedAt) return res.json({ user: publicUser(req.user) });
    const code = String(req.body?.code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code from your email." });
    const attempts = codeAttempts.get(req.user.id) || 0;
    if (attempts >= CODE_MAX_ATTEMPTS) {
      await prisma.authToken.deleteMany({ where: { userId: req.user.id, kind: "email_code" } });
      return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
    }
    const token = await prisma.authToken.findFirst({ where: { userId: req.user.id, kind: "email_code", tokenHash: codeHash(req.user.id, code), expiresAt: { gt: new Date() } } });
    if (!token) {
      codeAttempts.set(req.user.id, attempts + 1);
      const left = CODE_MAX_ATTEMPTS - attempts - 1;
      return res.status(400).json({ error: left > 0 ? `That code is incorrect or expired. ${left} ${left === 1 ? "attempt" : "attempts"} left.` : "That code is incorrect or expired. Request a new code." });
    }
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { emailVerifiedAt: new Date() } });
    await prisma.authToken.deleteMany({ where: { userId: user.id, kind: { in: ["email_verification", "email_code"] } } });
    codeAttempts.delete(user.id);
    void sendSecurityEmail(user, "verified").catch((error) => console.error("[mail] Verification confirmation failed:", error.message));
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.post("/resend-verification", authOptional, requireUser, async (req, res, next) => {
  try {
    if (req.user.emailVerifiedAt) return res.json({ message: "Your email is already verified." });
    const wait = RESEND_COOLDOWN_MS - (Date.now() - (resendAt.get(req.user.id) || 0));
    if (wait > 0) return res.status(429).json({ error: `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.`, retryAfterSeconds: Math.ceil(wait / 1000) });
    if (!rateLimitByIp(req, "resend-verification", 6, 60 * 60 * 1000)) return res.status(429).json({ error: "Too many requests. Please try again later." });
    try {
      const sent = await issueVerification(req.user);
      if (!sent) throw new Error("SMTP email is not configured.");
    } catch (error) {
      resendAt.delete(req.user.id);
      console.error("[mail] Resend verification failed:", error.message);
      return res.status(503).json({ error: "The email could not be sent. Please try again shortly." });
    }
    return res.json({ message: "A new code has been sent.", retryAfterSeconds: RESEND_COOLDOWN_MS / 1000 });
  } catch (error) { return next(error); }
});

router.post("/forgot-password", async (req, res) => {
  if (!rateLimitByIp(req, "forgot", 5, 60 * 60 * 1000)) return res.status(429).json({ error: "Too many password reset requests. Please try again later." });
  const email = normalizeEmail(req.body?.email);
  const generic = { message: "If an account exists for that email, a reset link has been prepared." };
  if (!validEmail(email)) return res.json(generic);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json(generic);
  await prisma.authToken.deleteMany({ where: { userId: user.id, kind: "password_reset" } });
  const token = randomToken();
  await prisma.authToken.create({ data: { userId: user.id, kind: "password_reset", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_HOURS * 3600000) } });
  try { await sendResetEmail(user, token); } catch (error) { console.error("[mail] Password reset delivery failed:", error.message); }
  return res.json(generic);
});

router.post("/reset-password", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = req.body?.password;
  if (!token || !validPassword(password)) return res.status(400).json({ error: "Provide a valid reset token and a new password." });
  const authToken = await prisma.authToken.findFirst({ where: { kind: "password_reset", tokenHash: hashToken(token), expiresAt: { gt: new Date() } } });
  if (!authToken) return res.status(400).json({ error: "This reset link is invalid or expired." });
  await prisma.user.update({ where: { id: authToken.userId }, data: { passwordHash: await hashPassword(password) } });
  await prisma.authToken.delete({ where: { id: authToken.id } });
  await prisma.authSession.deleteMany({ where: { userId: authToken.userId } });
  const sessionToken = await createSession(authToken.userId, req);
  setSessionCookie(res, sessionToken);
  const user = await prisma.user.findUnique({ where: { id: authToken.userId } });
  void sendSecurityEmail(user, "password").catch((error) => console.error("[mail] Password confirmation failed:", error.message));
  return res.json({ user: publicUser(user) });
});

router.patch("/profile", authOptional, requireUser, async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || "").trim();
    if (displayName.length > 120) return res.status(400).json({ error: "Display name must be 120 characters or fewer." });
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { displayName: displayName || null } });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/change-password", authOptional, requireUser, async (req, res, next) => {
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    if (typeof currentPassword !== "string" || !validPassword(newPassword)) return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) return res.status(401).json({ error: "Current password is incorrect." });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await prisma.authSession.deleteMany({ where: { userId: user.id, id: { not: req.authSession?.id || undefined } } });
    if (alertsEnabled(user)) void sendSecurityEmail(user, "password").catch((error) => console.error("[mail] Password confirmation failed:", error.message));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/dev-user", authOptional, async (req, res) => {
  if (String(process.env.NODE_ENV || "development") === "production") return res.status(404).json({ error: "Not found." });
  if (req.user && req.user.id !== "local-user") return res.json({ authenticated: true, user: publicUser(req.user) });
  return res.json({ authenticated: false, user: null });
});

export default router;
