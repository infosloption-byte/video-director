import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ModelPoolError, PROVIDERS } from "./modelPoolValidation.js";

function encryptionKey() {
  const raw = String(process.env.AI_POOL_ENCRYPTION_KEY || "").trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else if (raw) key = Buffer.from(raw, "base64");
  if (!key || key.length !== 32) throw new ModelPoolError(503, "AI Model Pool encryption key is not configured.");
  return key;
}
export function encryptCredential(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
export function decryptCredential(encoded) {
  const [v, iv, tag, payload] = String(encoded).split(".");
  if (v !== "v1" || !iv || !tag || !payload) throw new ModelPoolError(503, "Stored provider credential format is unsupported.");
  try {
    const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(payload, "base64")), cipher.final()]).toString("utf8");
  } catch { throw new ModelPoolError(503, "Unable to decrypt provider credential. Verify the encryption key."); }
}
export function configuredCredential(model) {
  if (model.encryptedCredential) return Boolean(process.env.AI_POOL_ENCRYPTION_KEY);
  const envKey = PROVIDERS[model.provider]?.env;
  return Boolean(envKey && String(process.env[envKey] || "").trim());
}
export function resolveModelCredential(model) {
  if (model.encryptedCredential) return decryptCredential(model.encryptedCredential);
  const envKey = PROVIDERS[model.provider]?.env;
  return envKey ? String(process.env[envKey] || "").trim() : "";
}
