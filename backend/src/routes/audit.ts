import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { requireConversationAdmin } from '../utils/authz';

const router = Router();

router.get('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    if (!(await requireConversationAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const logs = await prisma.auditLog.findMany({ where: { conversationId: convId }, include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
export async function createAuditLog(userId: number, conversationId: number, action: string, details?: string) {
  try {
    await prisma.auditLog.create({ data: { userId, conversationId, action, details } });
  } catch {
    // Ignore audit persistence failures.
  }
}
