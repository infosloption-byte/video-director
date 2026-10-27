import { prisma } from "../db/client.js";

export const PUBLIC_DEFAULT_CONFIG = Object.freeze({ registrationOpen: true, announcement: "" });
export function normalizePublicPlatformConfig(record) {
  return {
    registrationOpen: record?.registrationOpen !== false,
    announcement: String(record?.announcement || "").slice(0, 240),
  };
}
export async function getPublicPlatformConfig(db = prisma) {
  const config = await db.platformSettings.findUnique({ where: { id: "global" } });
  return normalizePublicPlatformConfig(config);
}
export async function isRegistrationOpen(db = prisma) {
  return (await getPublicPlatformConfig(db)).registrationOpen;
}
