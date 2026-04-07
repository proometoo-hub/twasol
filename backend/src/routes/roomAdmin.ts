import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { createAuditLog } from './audit';

const router = Router();

async function requireAdmin(userId: number, convId: number) {
  return prisma.conversationMember.findFirst({ where: { conversationId: convId, userId, role: 'admin', isBanned: false } });
}

async function getSuperAdmin(convId: number) {
  return prisma.conversationMember.findFirst({ where: { conversationId: convId, role: 'admin', isBanned: false }, orderBy: { joinedAt: 'asc' } });
}

async function isSuperAdmin(userId: number, convId: number) {
  const first = await getSuperAdmin(convId);
  return first?.userId === userId;
}

async function getMembership(convId: number, userId: number) {
  return prisma.conversationMember.findFirst({ where: { conversationId: convId, userId } });
}

router.put('/:id/settings', authenticateToken, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await requireAdmin(req.userId, id))) return res.status(403).json({ error: 'Admin only' });
    const { name, description, onlyAdmins, noMedia, noVoice, image, disappearAfter, requireApproval, welcomeMsg } = req.body;
    const updated = await prisma.conversation.update({ where: { id }, data: {
      ...(name !== undefined && { name }), ...(description !== undefined && { description }),
      ...(onlyAdmins !== undefined && { onlyAdmins }), ...(noMedia !== undefined && { noMedia }),
      ...(noVoice !== undefined && { noVoice }), ...(image !== undefined && { image }),
      ...(disappearAfter !== undefined && { disappearAfter }),
      ...(requireApproval !== undefined && { requireApproval }), ...(welcomeMsg !== undefined && { welcomeMsg })
    }});
    await createAuditLog(req.userId, id, 'settings_changed', JSON.stringify(req.body));
    res.json(updated);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/:id/requests', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const requests = await prisma.joinRequest.findMany({
      where: { conversationId: convId, status: 'pending' },
      include: { user: { select: { id: true, publicId: true, name: true, email: true, avatar: true, bio: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(requests);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/:id/requests/:requestId/approve', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), requestId = parseInt(req.params.requestId);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const reqRow = await prisma.joinRequest.findFirst({ where: { id: requestId, conversationId: convId, status: 'pending' }, include: { user: true } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    const existing = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: reqRow.userId } });
    if (!existing) await prisma.conversationMember.create({ data: { conversationId: convId, userId: reqRow.userId } });
    await prisma.joinRequest.update({ where: { id: requestId }, data: { status: 'approved', handledAt: new Date(), handledById: req.userId } });
    await prisma.message.create({ data: { text: `تمت الموافقة على انضمام ${reqRow.user.name}`, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'join_request_approved', `Approved ${reqRow.user.name}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/:id/requests/:requestId/reject', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), requestId = parseInt(req.params.requestId);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const reqRow = await prisma.joinRequest.findFirst({ where: { id: requestId, conversationId: convId, status: 'pending' }, include: { user: true } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    await prisma.joinRequest.update({ where: { id: requestId }, data: { status: 'rejected', handledAt: new Date(), handledById: req.userId } });
    await createAuditLog(req.userId, convId, 'join_request_rejected', `Rejected ${reqRow.user.name}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/:id/members', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const { userId } = req.body;
    const existing = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId } });
    if (existing) return res.status(400).json({ error: 'Already a member' });
    await prisma.conversationMember.create({ data: { userId, conversationId: convId } });
    await prisma.joinRequest.deleteMany({ where: { conversationId: convId, userId } });
    const addedUser = await prisma.user.findUnique({ where: { id: userId } });
    const adder = await prisma.user.findUnique({ where: { id: req.userId } });
    await prisma.message.create({ data: { text: `أضاف ${adder?.name} ${addedUser?.name}`, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'member_added', `Added ${addedUser?.name}`);
    const member = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId }, include: { user: { select: { id: true, name: true, avatar: true } } } });
    res.json(member);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:id/members/:userId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot remove yourself' });
    const target = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: targetId } });
    if (!target) return res.status(404).json({ error: 'Not found' });
    if (target.role === 'admin' && !(await isSuperAdmin(req.userId, convId))) return res.status(400).json({ error: 'Only super admin can remove admins' });
    await prisma.conversationMember.delete({ where: { id: target.id } });
    const removed = await prisma.user.findUnique({ where: { id: targetId } });
    await prisma.message.create({ data: { text: `تمت إزالة ${removed?.name}`, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'member_removed', `Removed ${removed?.name}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/members/:userId/role', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    const { role } = req.body;
    if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid' });
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const target = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: targetId } });
    if (!target) return res.status(404).json({ error: 'Not found' });
    if (target.role === 'admin' && role === 'member' && !(await isSuperAdmin(req.userId, convId))) return res.status(400).json({ error: 'Only super admin can demote admins' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: { role } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    const text = role === 'admin' ? `تمت ترقية ${targetUser?.name} لمسؤول` : `تمت إزالة صلاحية ${targetUser?.name}`;
    await prisma.message.create({ data: { text, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'role_changed', `${targetUser?.name} -> ${role}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/:id/transfer-ownership/:userId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    if (!(await isSuperAdmin(req.userId, convId))) return res.status(403).json({ error: 'Only owner can transfer ownership' });
    const currentOwner = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: req.userId } });
    const target = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: targetId } });
    if (!currentOwner || !target) return res.status(404).json({ error: 'Member not found' });
    await prisma.$transaction([
      prisma.conversationMember.update({ where: { id: currentOwner.id }, data: { role: 'admin' } }),
      prisma.conversationMember.update({ where: { id: target.id }, data: { role: 'admin', joinedAt: new Date(Date.now() - 1000) } })
    ]);
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    await prisma.message.create({ data: { text: `تم نقل ملكية المجموعة إلى ${targetUser?.name}`, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'ownership_transferred', `Transferred to ${targetUser?.name}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/members/:userId/mute', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const target = await prisma.conversationMember.findFirst({ where: { conversationId: convId, userId: targetId } });
    if (!target) return res.status(404).json({ error: 'Not found' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: { isMuted: !!req.body.muted } });
    await createAuditLog(req.userId, convId, req.body.muted ? 'muted' : 'unmuted', `User ${targetId}`);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});


router.put('/:id/members/:userId/media', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    const { allowed } = req.body;
    if (typeof allowed !== 'boolean') return res.status(400).json({ error: 'Invalid' });
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const target = await getMembership(convId, targetId);
    if (!target || target.isBanned) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'admin' && !(await isSuperAdmin(req.userId, convId))) return res.status(400).json({ error: 'Only owner can change admin restrictions' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: { canSendMedia: allowed } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    const text = allowed ? `تم السماح للوسائط لدى ${targetUser?.name}` : `تم منع الوسائط عن ${targetUser?.name}`;
    await prisma.message.create({ data: { text, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'member_media_permission', `${targetUser?.name} -> ${allowed ? 'allowed' : 'blocked'}`);
    res.json({ success: true, canSendMedia: allowed });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/members/:userId/voice', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    const { allowed } = req.body;
    if (typeof allowed !== 'boolean') return res.status(400).json({ error: 'Invalid' });
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const target = await getMembership(convId, targetId);
    if (!target || target.isBanned) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'admin' && !(await isSuperAdmin(req.userId, convId))) return res.status(400).json({ error: 'Only owner can change admin restrictions' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: { canSendVoice: allowed } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    const text = allowed ? `تم السماح بالصوتيات لدى ${targetUser?.name}` : `تم منع الصوتيات عن ${targetUser?.name}`;
    await prisma.message.create({ data: { text, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, 'member_voice_permission', `${targetUser?.name} -> ${allowed ? 'allowed' : 'blocked'}`);
    res.json({ success: true, canSendVoice: allowed });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/members/:userId/tag', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    const tag = (req.body.tag || '').toString().trim().slice(0, 30) || null;
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const target = await getMembership(convId, targetId);
    if (!target || target.isBanned) return res.status(404).json({ error: 'Member not found' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: { tag } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    await createAuditLog(req.userId, convId, 'member_tag_changed', `${targetUser?.name} -> ${tag || 'none'}`);
    res.json({ success: true, tag });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id/members/:userId/ban', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.id), targetId = parseInt(req.params.userId);
    const banned = !!req.body.banned;
    const reason = (req.body.reason || '').toString().trim().slice(0, 140) || null;
    if (!(await requireAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot ban yourself' });
    const target = await getMembership(convId, targetId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'admin' && !(await isSuperAdmin(req.userId, convId))) return res.status(400).json({ error: 'Only owner can ban admins' });
    await prisma.conversationMember.update({ where: { id: target.id }, data: {
      isBanned: banned,
      bannedReason: banned ? reason : null,
      bannedAt: banned ? new Date() : null,
      isMuted: banned ? true : target.isMuted
    } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
    const text = banned ? `تم حظر ${targetUser?.name} من ${convId ? 'المحادثة' : 'المجموعة'}${reason ? `: ${reason}` : ''}` : `تم إلغاء حظر ${targetUser?.name}`;
    await prisma.message.create({ data: { text, senderId: req.userId, conversationId: convId, isSystem: true } });
    await createAuditLog(req.userId, convId, banned ? 'member_banned' : 'member_unbanned', `${targetUser?.name}${reason ? ` | ${reason}` : ''}`);
    res.json({ success: true, isBanned: banned });
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
