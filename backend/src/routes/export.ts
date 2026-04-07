import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Export conversation as JSON
router.get('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId);
    const membership = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: req.userId } });
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const conv = await prisma.conversation.findUnique({
      where: { id: convId },
      include: { members: { include: { user: { select: { id: true, name: true } } } } }
    });

    const messages = await prisma.message.findMany({
      where: { conversationId: convId, isDeleted: false },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'asc' }
    });

    const format = req.query.format || 'json';

    if (format === 'txt') {
      let text = `=== ${conv?.name || 'محادثة'} ===\n\n`;
      messages.forEach(m => {
        const time = new Date(m.createdAt).toLocaleString('ar');
        if (m.isSystem) { text += `--- ${m.text} ---\n`; }
        else { text += `[${time}] ${m.sender?.name}: ${m.text || m.fileName || m.type}\n`; }
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=chat-${convId}.txt`);
      return res.send(text);
    }

    res.json({ conversation: conv, messages, exportedAt: new Date().toISOString() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

export default router;
