const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins() {
  return String(process.env.AUTH_ALLOWED_ORIGINS || process.env.AUTH_PUBLIC_URL || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function sameOriginProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || allowedOrigins().includes(origin)) return next();
  return res.status(403).json({ error: "Cross-origin request blocked." });
}
