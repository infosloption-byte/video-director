import crypto from "node:crypto";
import { prisma } from "../db/client.js";

const COOKIE_NAME = "helix_session";
const SESSION_DAYS = 30;
const DEV_FALLBACK_USER = "local-user";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index <= 0) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function cookieOptions(maxAgeMs) {
  const secure = String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true";
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    maxAgeMs === 0 ? "Max-Age=0" : `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function setSessionCookie(res, token, maxAgeMs = SESSION_DAYS * 86400000) {
  const secure = String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true";
  const sameSite = String(process.env.COOKIE_SAMESITE || "Lax");
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", cookieOptions(0));
}

export async function resolveSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return { session, user: session.user };
}

export async function authOptional(req, _res, next) {
  try {
    const resolved = await resolveSession(req);
    req.user = resolved?.user || null;
    req.authSession = resolved?.session || null;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const resolved = await resolveSession(req);
    if (resolved?.user) {
      req.user = resolved.user;
      req.authSession = resolved.session;
      return next();
    }

    const authRequired = String(process.env.AUTH_REQUIRED || "false").toLowerCase() === "true";
    if (!authRequired && String(process.env.NODE_ENV || "development") !== "production") {
      req.user = { id: DEV_FALLBACK_USER, email: "local-user@helix.local", displayName: "Local User" };
      req.authSession = null;
      return next();
    }

    return res.status(401).json({ error: "Authentication required." });
  } catch (error) {
    return next(error);
  }
}

export function requireOwner(project) {
  return Boolean(project);
}

export function getRequestUserId(req) {
  return req.user?.id || DEV_FALLBACK_USER;
}
