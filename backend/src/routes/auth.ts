import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { getClientHost, getDeviceName, getRequiredJwtSecret } from '../utils/config';
import { generateUniquePublicId } from '../utils/ids';
import { hashSessionToken } from '../utils/sessionToken';

const router = Router();

function publicUser(user: any) {
  return {
    id: user.id,
    publicId: user.publicId,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    phone: user.phone
  };
}

async function createSession(userId: number, token: string, req: any) {
  await prisma.session.create({
    data: {
      userId,
      token: hashSessionToken(token),
      ip: getClientHost(req),
      device: getDeviceName(req)
    }
  });
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    if (!name || !normalizedEmail || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password too short' });
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        publicId: await generateUniquePublicId(),
        name: name.trim(),
        email: normalizedEmail,
        password: hashed,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00a884&color=fff&size=200`
      }
    });
    const token = jwt.sign({ userId: user.id }, getRequiredJwtSecret(), { expiresIn: '7d' });
    await createSession(user.id, token, req);
    res.json({ user: publicUser(user), token });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) return res.status(400).json({ error: 'All fields required' });
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'online', lastSeen: new Date() } });
    const token = jwt.sign({ userId: user.id }, getRequiredJwtSecret(), { expiresIn: '7d' });
    await createSession(user.id, token, req);
    res.json({ user: publicUser(user), token });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/logout', async (req: any, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
      const hashed = hashSessionToken(token);
      await prisma.session.deleteMany({ where: { OR: [{ token: hashed }, { token }] } });
    }
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

export default router;
