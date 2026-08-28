import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../db/client.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { authOptional, clearSessionCookie, getRequestUserId, setSessionCookie } from "../middleware/auth.js";

const router = Router();
const SESSION_DAYS = 30;
const TOKEN_HOURS = 2;
const EMAIL_TOKEN_HOURS = 24;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;
const resetLimiter = new Map();

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
    email: user.email,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
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

async function createSession(userId) {
  const raw = randomToken();
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
    },
  });
  return raw;
}

router.get("/me", authOptional, async (req, res) => {
  if (req.user) return res.json({ authenticated: true, user: publicUser(req.user) });
  return res.json({ authenticated: false, user: null });
});

router.post("/signup", async (req, res, next) => {
  try {
    if (!rateLimitByIp(req, "signup", 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-up attempts. Please try again later." });
    const email = normalizeEmail(req.body?.email);
    const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
    const password = req.body?.password;
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!validPassword(password)) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const user = await prisma.user.create({ data: { email, displayName: displayName || null, passwordHash: await hashPassword(password) } });
    const verifyToken = randomToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        kind: "email_verification",
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_HOURS * 3600000),
      },
    });

    const sessionToken = await createSession(user.id);
    setSessionCookie(res, sessionToken);
    const verificationUrl = `/verify-email?token=${encodeURIComponent(verifyToken)}`;
    if (String(process.env.NODE_ENV || "development") !== "production") console.log(`[auth] Email verification URL for ${email}: ${verificationUrl}`);

    return res.status(201).json({ user: publicUser(user), emailVerificationRequired: true, verificationUrl: String(process.env.AUTH_PUBLIC_URL || "") + verificationUrl });
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
    const sessionToken = await createSession(user.id);
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
  await prisma.authToken.delete({ where: { id: authToken.id } });
  return res.json({ user: publicUser(user) });
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
  const resetPath = `/reset-password?token=${encodeURIComponent(token)}`;
  if (String(process.env.NODE_ENV || "development") !== "production") console.log(`[auth] Password reset URL for ${email}: ${resetPath}`);
  return res.json({ ...generic, resetUrl: String(process.env.AUTH_PUBLIC_URL || "") + resetPath });
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
  const sessionToken = await createSession(authToken.userId);
  setSessionCookie(res, sessionToken);
  const user = await prisma.user.findUnique({ where: { id: authToken.userId } });
  return res.json({ user: publicUser(user) });
});

router.get("/dev-user", authOptional, async (req, res) => {
  if (String(process.env.NODE_ENV || "development") === "production") return res.status(404).json({ error: "Not found." });
  if (req.user && req.user.id !== "local-user") return res.json({ authenticated: true, user: publicUser(req.user) });
  return res.json({ authenticated: false, user: null });
});

export { getRequestUserId };
export default router;
