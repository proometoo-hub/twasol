import { Router } from 'express';
import prisma from '../prisma';
import { isAdminUser } from '../utils/admin';
import { authenticateToken } from '../middleware/auth';

const router = Router();

type AuthedRequest = {
  userId?: number;
  body: any;
  query: any;
  params: any;
};

async function requireAdmin(userId: number) {
  return isAdminUser(userId);
}

router.post('/', authenticateToken, async (req: AuthedRequest, res) => {
  try {
    const { reportedId, reason, details, conversationId, messageId } = req.body;
    if (!reportedId || !reason) return res.status(400).json({ error: 'Required' });
    if (Number(reportedId) === Number(req.userId)) return res.status(400).json({ error: 'Cannot report yourself' });

    const payload = [
      details,
      conversationId ? `conversation:${conversationId}` : null,
      messageId ? `message:${messageId}` : null,
    ].filter(Boolean).join('\n');

    const report = await prisma.report.create({
      data: { reporterId: req.userId!, reportedId, reason, details: payload || null }
    });
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/', authenticateToken, async (req: AuthedRequest, res) => {
  try {
    if (!(await requireAdmin(req.userId!))) return res.status(403).json({ error: 'Admin only' });
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (q) {
      where.OR = [
        { reason: { contains: q } },
        { details: { contains: q } },
        { reporter: { name: { contains: q } } },
        { reporter: { email: { contains: q } } },
        { reported: { name: { contains: q } } },
        { reported: { email: { contains: q } } },
        { reported: { publicId: { contains: q } } }
      ];
    }
    const reports = await prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, publicId: true, name: true, email: true, avatar: true } },
        reported: { select: { id: true, publicId: true, name: true, email: true, avatar: true } }
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/summary', authenticateToken, async (req: AuthedRequest, res) => {
  try {
    if (!(await requireAdmin(req.userId!))) return res.status(403).json({ error: 'Admin only' });
    const [pending, reviewed, dismissed, today] = await Promise.all([
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.report.count({ where: { status: 'reviewed' } }),
      prisma.report.count({ where: { status: 'dismissed' } }),
      prisma.report.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } })
    ]);
    res.json({ pending, reviewed, dismissed, today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/:id/status', authenticateToken, async (req: AuthedRequest, res) => {
  try {
    if (!(await requireAdmin(req.userId!))) return res.status(403).json({ error: 'Admin only' });
    const id = parseInt(req.params.id, 10);
    const { status, adminNote } = req.body;
    if (!['pending', 'reviewed', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const existing = await prisma.report.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.report.update({
      where: { id },
      data: {
        status,
        details: [existing.details, adminNote ? `admin-note:${adminNote}` : null].filter(Boolean).join('\n') || null
      },
      include: {
        reporter: { select: { id: true, publicId: true, name: true, email: true, avatar: true } },
        reported: { select: { id: true, publicId: true, name: true, email: true, avatar: true } }
      }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
