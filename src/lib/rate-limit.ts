const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}
