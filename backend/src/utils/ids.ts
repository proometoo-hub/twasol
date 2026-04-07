import prisma from '../prisma';

export async function generateUniquePublicId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    const exists = await prisma.user.findUnique({ where: { publicId: candidate } });
    if (!exists) return candidate;
  }
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 12);
}
