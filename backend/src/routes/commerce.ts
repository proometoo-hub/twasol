import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { requireConversationAdmin, requireConversationMember } from '../utils/authz';

const router = Router();
router.get('/balance', authenticateToken, async (req: any, res) => { try { const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { walletBalance: true } }); res.json({ balance: user?.walletBalance || 0 }); } catch { res.status(500).json({ error: 'Error' }); } });
router.post('/transfer', authenticateToken, async (req: any, res) => {
  try {
    const receiverId = Number(req.body?.receiverId);
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note || '').trim() || null;
    if (!receiverId || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid transfer payload' });
    if (receiverId === req.userId) return res.status(400).json({ error: 'Cannot transfer to yourself' });

    const tx = await prisma.$transaction(async (txClient) => {
      const [sender, receiver] = await Promise.all([
        txClient.user.findUnique({ where: { id: req.userId }, select: { id: true, walletBalance: true } }),
        txClient.user.findUnique({ where: { id: receiverId }, select: { id: true } }),
      ]);
      if (!sender || !receiver) throw new Error('User not found');
      if (sender.walletBalance < amount) throw new Error('Insufficient balance');

      await txClient.user.update({ where: { id: req.userId }, data: { walletBalance: { decrement: amount } } });
      await txClient.user.update({ where: { id: receiverId }, data: { walletBalance: { increment: amount } } });
      return txClient.walletTx.create({ data: { senderId: req.userId, receiverId, amount, note, type: 'transfer' } });
    });

    res.json(tx);
  } catch (err: any) {
    const message = err?.message || 'Error';
    const status = /Invalid|Insufficient|Cannot transfer|not found/i.test(message) ? 400 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: message });
  }
});
router.post('/invoice', authenticateToken, async (req: any, res) => { try { const { receiverId, amount, note } = req.body; const tx = await prisma.walletTx.create({ data: { senderId: req.userId, receiverId, amount, note, type: 'invoice' } }); res.json(tx); } catch { res.status(500).json({ error: 'Error' }); } });
router.get('/history', authenticateToken, async (req: any, res) => { try { const txs = await prisma.walletTx.findMany({ where: { OR: [{ senderId: req.userId }, { receiverId: req.userId }] }, include: { sender: { select: { id: true, name: true, avatar: true } }, receiver: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }); res.json(txs); } catch { res.status(500).json({ error: 'Error' }); } });
router.post('/products/:convId', authenticateToken, async (req: any, res) => { try { const convId = parseInt(req.params.convId); if (!(await requireConversationAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' }); const { name, description, price, image, stock } = req.body; const product = await prisma.product.create({ data: { name, description, price, image, stock: stock || 0, conversationId: convId, createdById: req.userId } }); res.json(product); } catch { res.status(500).json({ error: 'Error' }); } });
router.get('/products/:convId', authenticateToken, async (req: any, res) => { try { const convId = parseInt(req.params.convId); if (!(await requireConversationMember(req.userId, convId))) return res.status(403).json({ error: 'Access denied' }); const products = await prisma.product.findMany({ where: { conversationId: convId }, orderBy: { createdAt: 'desc' } }); res.json(products); } catch { res.status(500).json({ error: 'Error' }); } });
router.post('/products/:productId/order', authenticateToken, async (req: any, res) => { try { const { quantity } = req.body; const product = await prisma.product.findUnique({ where: { id: parseInt(req.params.productId) } }); if (!product) return res.status(404).json({ error: 'Not found' }); if (!(await requireConversationMember(req.userId, product.conversationId))) return res.status(403).json({ error: 'Access denied' }); const order = await prisma.productOrder.create({ data: { productId: product.id, buyerId: req.userId, quantity: quantity || 1 } }); res.json(order); } catch { res.status(500).json({ error: 'Error' }); } });
export default router;
