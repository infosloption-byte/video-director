import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_BYTES = 600_000;
const BLOCKED_TLDS = /\.(?:localhost|local|internal|test|invalid|example)$/i;
const BLOCKED_PATHS = /\/(?:wp-admin|admin|login|logout|signin|signup|checkout|cart|account|api|graphql)(?:\/|$)/i;
// Support only the common apex-to-www canonical redirect, never arbitrary subdomains.
const canonicalHost = host => String(host).toLowerCase().replace(/^www\./, "");
const sameCanonicalHost = (left, right) => canonicalHost(left) === canonicalHost(right);


function isPublicIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) {
    const a = ip.split(".").map(Number);
    if (a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
        (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
        (a[0] === 169 && a[1] === 254) ||
        (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
        (a[0] === 192 && (a[1] === 168 || a[1] === 0)) ||
        (a[0] === 198 && (a[1] === 18 || a[1] === 19)) ||
        (a[0] === 192 && a[1] === 88 && a[2] === 99) ||
        (a[0] === 198 && a[1] === 51 && a[2] === 100) ||
        (a[0] === 203 && a[1] === 0 && a[2] === 113) ||
        (a[0] === 192 && a[1] === 0 && a[2] === 2)) return false;
    return true;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    // Do not allow embedded IPv4 addresses or other special-use IPv6 ranges.
    return /^[23][0-9a-f]{3}:/i.test(lower) && !/^2001:0?db8:/i.test(lower);
  }
  return false;
}

export function normalizeWebsiteUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Enter a valid public website URL.");
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a full URL starting with https:// or http://."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    net.isIP(url.hostname) || !url.hostname.includes(".") ||
    BLOCKED_TLDS.test(url.hostname) || url.hostname.endsWith(".onion") ||
    (url.port && !["80", "443"].includes(url.port))) {
    throw new Error("Only public HTTP(S) websites with standard ports are supported.");
  }
  url.hash = "";
  return url;
}

export function safeInternalUrl(value, site) {
  try {
    const link = new URL(value, site);
    if (!sameCanonicalHost(link.hostname, site.hostname) || link.username || link.password ||
      !["http:", "https:"].includes(link.protocol) ||
      (link.port && !["80", "443"].includes(link.port)) ||
      (site.protocol === "https:" && link.protocol !== "https:") ||
      BLOCKED_PATHS.test(link.pathname) ||
      /\.(?:pdf|zip|rar|gz|mp4|mov|avi|mp3|png|jpe?g|gif|webp|svg|woff2?|css|js|xml)(?:$|\?)/i.test(link.pathname)) return null;
    link.hash = "";
    link.search = "";
    return link.href;
  } catch { return null; }
}

async function approvedAddresses(hostname) {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(row => !isPublicIp(row.address))) {
    throw new Error("The website resolved to a non-public or unsupported network address.");
  }
  return records;
}

function requestText(url, records, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    let ended = false;
    const req = transport.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "VoxoraWebsiteResearch/1.0 (+https://usevoxora.online)", Accept: "text/html,application/xml,text/plain;q=0.8" },
      lookup: (_hostname, _options, callback) => {
        const target = records.find(x => x.family === 4) || records[0];
        callback(null, target.address, target.family);
      },
      signal,
    }, res => {
      const parts = []; let bytes = 0;
      res.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { req.destroy(new Error("Website response exceeds the page size limit.")); return; }
        parts.push(chunk);
      });
      res.on("end", () => {
        ended = true;
        resolve({ status: res.statusCode, type: String(res.headers["content-type"] || ""), location: res.headers.location, text: Buffer.concat(parts).toString("utf8") });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Website request timed out.")));
    req.on("error", err => { if (!ended) reject(err); });
  });
}

export async function fetchPublicPage(rawUrl, { signal } = {}) {
  let url = normalizeWebsiteUrl(rawUrl);
  const host = url.hostname;
  for (let hops = 0; hops < 4; hops += 1) {
    const records = await approvedAddresses(url.hostname);
    const result = await requestText(url, records, signal);
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
      const target = new URL(result.location, url);
      if (!sameCanonicalHost(target.hostname, host) || !["http:", "https:"].includes(target.protocol) ||
        (url.protocol === "https:" && target.protocol !== "https:") ||
        target.username || target.password || (target.port && !["80", "443"].includes(target.port))) {
        throw new Error("The website redirected outside its allowed origin.");
      }
      url = target;
      continue;
    }
    if (result.status < 200 || result.status >= 300) {
      const error = new Error("Website returned HTTP " + result.status + ".");
      error.status = result.status;
      throw error;
    }
    return { ...result, url: url.href };
  }
  throw new Error("Too many website redirects.");
}

export function robotsAllowed(pathname, robots) {
  if (!robots) return true;
  const lines = robots.split(/\r?\n/).map(x => x.replace(/#.*/, "").trim());
  let active = false, anyGroup = false;
  const rules = [];
  for (const line of lines) {
    const [key, ...tail] = line.split(":");
    const field = key?.toLowerCase();
    const value = tail.join(":").trim();
    if (field === "user-agent") {
      if (anyGroup && rules.length) active = false;
      if (!anyGroup || rules.length) { anyGroup = false; }
      if (value === "*" || value.toLowerCase() === "voxorawebsiteresearch") active = true;
    } else if (["allow", "disallow"].includes(field) && active && value.startsWith("/")) {
      rules.push({ allowed: field === "allow", path: value.split("*")[0] });
      anyGroup = true;
    }
  }
  const applicable = rules.filter(rule => pathname.startsWith(rule.path)).sort((a,b) => b.path.length - a.path.length);
  return applicable.length ? applicable[0].allowed : true;
}

export { isPublicIp };
