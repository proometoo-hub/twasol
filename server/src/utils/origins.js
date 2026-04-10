const splitCsv = (value = '') => String(value)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const patternToRegex = (pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

export const buildAllowedOrigins = (...values) => {
  const seen = new Set();
  return values.flatMap(splitCsv).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
};

export const isAllowedOrigin = (origin, allowedOrigins = []) => {
  if (!origin) return true;
  if (!allowedOrigins.length) return true;

  return allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (allowed.includes('*')) return patternToRegex(allowed).test(origin);
    return false;
  });
};
