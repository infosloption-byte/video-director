export function isPlatformAdminUser(user) {
  return Boolean(user?.id && user.emailVerifiedAt && user.role === "platform_admin");
}
