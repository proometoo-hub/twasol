import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { createAuditLog } from './audit';

const router = Router();

router.post('/create', authenticateToken, async (req: any, res) => {
  try {
    const { name, description, isGroup, isChannel, userIds, requireApproval, welcomeMsg } = req.body;
    const ownerId = req.userId;
    if ((isGroup || isChannel) && !name) return res.status(400).json({ error: 'Name required' });
    const memberIds = [...new Set([ownerId, ...(userIds || [])])];
    const room = await prisma.conversation.create({
      data: {
        name: (isGroup || isChannel) ? name : null, description: description || null,
        isGroup: !!isGroup, isChannel: !!isChannel, onlyAdmins: !!isChannel,
        requireApproval: !!requireApproval,
        welcomeMsg: welcomeMsg || null,
        members: { create: memberIds.map((id: number) => ({ userId: id, role: id === ownerId ? 'admin' : 'member' })) }
      },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true } } } } }
    });
    // System message
    if (isGroup || isChannel) {
      await prisma.message.create({ data: { text: `تم إنشاء ${isChannel ? 'القناة' : 'المجموعة'}`, senderId: ownerId, conversationId: room.id, isSystem: true } });
      await createAuditLog(ownerId, room.id, 'created', `Created ${isChannel ? 'channel' : 'group'}: ${name}`);
    }
    res.json(room);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

router.get('/private/:otherUserId', authenticateToken, async (req: any, res) => {
  try {
    const myId = req.userId, otherId = parseInt(req.params.otherUserId);
    if (isNaN(otherId) || myId === otherId) return res.status(400).json({ error: 'Invalid' });
    const block = await prisma.block.findFirst({ where: { OR: [{ userId: myId, blockedId: otherId }, { userId: otherId, blockedId: myId }] } });
    if (block) return res.status(403).json({ error: 'Blocked' });
    const otherUser = await prisma.user.findUnique({ where: { id: otherId } });
    if (!otherUser) return res.status(404).json({ error: 'Not found' });
    let conv = await prisma.conversation.findFirst({
      where: { isGroup: false, isChannel: false, AND: [{ members: { some: { userId: myId } } }, { members: { some: { userId: otherId } } }] },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true, status: true, lastSeen: true, hideLastSeen: true } } } } }
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { isGroup: false, members: { create: [{ userId: myId }, { userId: otherId }] } },
        include: { members: { include: { user: { select: { id: true, name: true, avatar: true, status: true, lastSeen: true, hideLastSeen: true } } } } }
      });
    }
    res.json(conv);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/my', authenticateToken, async (req: any, res) => {
  try {
    const convs = await prisma.conversation.findMany({
      where: { members: { some: { userId: req.userId, isBanned: false } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true, status: true, lastSeen: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(convs);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/:id/info', authenticateToken, async (req: any, res) => {
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: parseInt(req.params.id) },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true, status: true, bio: true } } }, orderBy: { role: 'asc' } } }
    });
    if (!conv) return res.status(404).json({ error: 'Not found' });
    const my = conv.members.find(m => m.userId === req.userId && !m.isBanned);
    if (!my) return res.status(403).json({ error: 'Not a member' });
    res.json({ ...conv, myRole: my.role, myMuteNotifs: my.muteNotifs });
  } catch { res.status(500).json({ error: 'Error' }); }
});

// Shared media
router.get('/:id/media', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id);
    const membership = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: req.userId, isBanned: false } });
    if (!membership) return res.status(403).json({ error: 'Access denied' });
    const media = await prisma.message.findMany({
      where: { conversationId: convId, isDeleted: false, type: { in: ['image', 'video', 'file', 'voice'] } },
      select: { id: true, type: true, fileUrl: true, fileName: true, fileSize: true, createdAt: true, sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 100
    });
    res.json(media);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/mute-notifs', authenticateToken, async (req: any, res) => {
  try {
    const m = await prisma.conversationMember.findFirst({ where: { conversationId: parseInt(req.params.id), userId: req.userId, isBanned: false } });
    if (!m) return res.status(404).json({ error: 'Not a member' });
    await prisma.conversationMember.update({ where: { id: m.id }, data: { muteNotifs: !m.muteNotifs } });
    res.json({ muteNotifs: !m.muteNotifs });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:id/leave', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id);
    const m = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: req.userId, isBanned: false } });
    if (!m) return res.status(404).json({ error: 'Not a member' });
    await prisma.conversationMember.delete({ where: { id: m.id } });
    // System message
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    await prisma.message.create({ data: { text: `غادر ${user?.name}`, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'left', `${user?.name} left`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
