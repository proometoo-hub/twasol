import prisma from "../prisma";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function allowFirstUserFallback(): boolean {
  return /^(1|true|yes)$/i.test(process.env.ALLOW_FIRST_USER_ADMIN || '');
}

export async function isAdminUser(userId: number): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, createdAt: true } });
  if (!me) return false;

  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0) {
    return adminEmails.includes((me.email || '').toLowerCase());
  }

  if (!allowFirstUserFallback()) return false;
  const firstUser = await prisma.user.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  return !!firstUser && firstUser.id === me.id;
}

export async function getAdminBootstrapInfo() {
  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0) {
    return { mode: 'env', adminEmailsConfigured: adminEmails.length };
  }
  return {
    mode: allowFirstUserFallback() ? 'first-user-fallback-enabled' : 'disabled',
  };
}
