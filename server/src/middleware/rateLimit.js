const buckets = new Map();

function numberEnv(name, fallback, min = 1) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return `user:${req.user?.id || "anonymous"}:ip:${forwarded || req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function policyFor(req) {
  const path = String(req.path || "");
  const method = String(req.method || "GET").toUpperCase();

  if (method === "GET" && (path === "/dashboard/manage"
    || /^\/dashboard\/invoice\/txn_[a-z0-9]{20,100}$/.test(path))) {
    return { windowMs: 60 * 1000, max: 12 };
  }
  if (path === "/search" && method === "GET") {
    return { windowMs: numberEnv("SIGNAL_SEARCH_RATE_WINDOW_MS", 5 * 60 * 1000), max: numberEnv("SIGNAL_SEARCH_RATE_LIMIT", 30) };
  }
  if (path === "/" && method === "POST") {
    return { windowMs: numberEnv("PROJECT_CREATE_RATE_WINDOW_MS", 10 * 60 * 1000), max: numberEnv("PROJECT_CREATE_RATE_LIMIT", 10) };
  }
  // Billable image generations share one account/IP budget across all
  // scenes; per-scene route IDs cannot create independent budgets.
  if (/^\/scenes\/[^/]+\/regenerate-assets$/.test(path) &&
      method === "POST" && req.body?.visualMode === "ai") {
    return { windowMs: numberEnv("MARKETING_AI_IMAGE_RATE_WINDOW_MS",10*60*1000),
      max: numberEnv("MARKETING_AI_IMAGE_RATE_LIMIT",12) };
  }
  if (/^\/[^/]+\/(generate-scenes|generate-voice)$/.test(path) && method === "POST") {
    return { windowMs: numberEnv("PROVIDER_RATE_WINDOW_MS", 10 * 60 * 1000), max: numberEnv("PROVIDER_RATE_LIMIT", 10) };
  }
  if (/^\/[^/]+\/media\/search$/.test(path) && method === "GET") {
    return { windowMs: numberEnv("MEDIA_SEARCH_RATE_WINDOW_MS", 5 * 60 * 1000), max: numberEnv("MEDIA_SEARCH_RATE_LIMIT", 20) };
  }
  if (/^(?:\/[^/]+)?\/projects\/[^/]+\/render$/.test(path) && method === "POST") {
    return { windowMs: numberEnv("RENDER_RATE_WINDOW_MS", 10 * 60 * 1000), max: numberEnv("RENDER_RATE_LIMIT", 6) };
  }
  if (/^(?:\/[^/]+)?\/projects\/[^/]+\/editor\/render$/.test(path) && method === "POST") {
    return { windowMs: numberEnv("EDITOR_RENDER_RATE_WINDOW_MS", 10 * 60 * 1000), max: numberEnv("EDITOR_RENDER_RATE_LIMIT", 6) };
  }
  if (/^(?:\/[^/]+)?\/projects\/[^/]+\/editor\/ai\/suggest$/.test(path) && method === "POST") {
    return { windowMs: numberEnv("EDITOR_AI_RATE_WINDOW_MS", 10 * 60 * 1000), max: numberEnv("EDITOR_AI_RATE_LIMIT", 12) };
  }
  return null;
}

export function expensiveOperationRateLimit(req, res, next) {
  const policy = policyFor(req);
  if (!policy) return next();

  const now = Date.now();
  const isBillingLink = req.path === "/dashboard/manage"
    || /^\/dashboard\/invoice\/txn_[a-z0-9]{20,100}$/.test(req.path);
  // Invoice IDs and X-Forwarded-For are not independent budgets. Apply one
  // account-scoped cap to all invoice PDFs, one cap to portal sessions.
  const scope = isBillingLink && req.user?.id
    ? `billing:user:${req.user.id}`
    : clientKey(req);
  const aiImageRoute = /^\/scenes\/[^/]+\/regenerate-assets$/.test(req.path) &&
    req.method === "POST" && req.body?.visualMode === "ai";
  const routeKey = aiImageRoute ? "/scenes/ai-image" : isBillingLink
    ? req.path === "/dashboard/manage" ? "/dashboard/manage" : "/dashboard/invoice"
    : req.path;
  const key = `${scope}:${req.method}:${routeKey}`;
  const existing = buckets.get(key);
  const bucket = existing && now - existing.startedAt < policy.windowMs ? existing : { startedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > policy.max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + policy.windowMs - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many expensive requests. Please try again later.", retryAfterSeconds: retryAfter });
  }
  return next();
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, bucket] of buckets) if (bucket.startedAt < cutoff) buckets.delete(key);
}, 15 * 60 * 1000);
cleanupTimer.unref?.();
