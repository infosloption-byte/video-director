import crypto from "node:crypto";

const KEYLEN = 64;
const SALT_BYTES = 16;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
    crypto.scrypt(password, salt, KEYLEN, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt}$${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [scheme, salt, expectedHex] = String(stored || "").split("$");
    if (scheme !== "scrypt" || !salt || !expectedHex) return resolve(false);
    crypto.scrypt(password, salt, KEYLEN, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(expectedHex, "hex");
      const actual = Buffer.from(derivedKey.toString("hex"), "hex");
      resolve(expected.length === actual.length && crypto.timingSafeEqual(expected, actual));
    });
  });
}
