import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance. `node --watch` (used by `npm run dev`) can
// re-execute this module without a fresh process, so guard against creating
// more than one client in that case.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__helixPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__helixPrisma = prisma;
}
