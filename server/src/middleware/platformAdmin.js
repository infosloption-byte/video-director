/** Explicit platform authorization. Never trust client-sent roles, emails, or preferences. */
export function isPlatformAdmin(user) {
  return Boolean(user?.id && user?.emailVerifiedAt && user.role === "platform_admin");
}

export function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user) || !req.authSession?.id) {
    return res.status(403).json({ code: "PLATFORM_ADMIN_REQUIRED", error: "Platform administrator access required." });
  }
  return next();
}
