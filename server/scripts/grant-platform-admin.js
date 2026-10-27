import "dotenv/config";
import { prisma } from "../src/db/client.js";

// Deliberately an operator-only CLI: public registration and HTTP cannot grant roles.
const email = String(process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
const confirmed = process.argv.includes("--confirm=GRANT_PLATFORM_ADMIN");
if (!email || !confirmed || process.argv.length !== 3) {
  console.error("Usage: PLATFORM_ADMIN_EMAIL=owner@example.com node scripts/grant-platform-admin.js --confirm=GRANT_PLATFORM_ADMIN");
  process.exitCode = 2;
} else {
  try {
    const account = await prisma.user.findUnique({ where: { email } });
    if (!account || !account.emailVerifiedAt || !account.passwordHash) {
      throw new Error("A verified existing account with password credentials is required.");
    }
    if (account.role === "platform_admin") {
      console.log("Account is already a platform administrator.");
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: account.id }, data: { role: "platform_admin" } });
        await tx.adminAuditLog.create({ data: { actorUserId: null, targetUserId: account.id, action: "platform_admin.bootstrap_grant" } });
      });
      console.log("Platform administrator granted to verified existing account.");
    }
  } catch (error) {
    console.error("Platform administrator bootstrap failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
