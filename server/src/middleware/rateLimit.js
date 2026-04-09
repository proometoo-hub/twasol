const buckets = new Map();

const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key);
  }
};

setInterval(cleanup, 60_000).unref();

export const rateLimit = ({ windowMs = 60_000, max = 60, keyPrefix = 'global' } = {}) => (req, res, next) => {
  const actor = req.user?.id || req.ip || 'anon';
  const key = `${keyPrefix}:${actor}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  current.count += 1;
  if (current.count > max) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests, try again shortly.' });
  }

  return next();
};
