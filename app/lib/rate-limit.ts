import "server-only";

/**
 * Fixed-window, in-memory rate limiter.
 *
 * NOTE (serverless): on Vercel each lambda instance keeps its own Map, so this
 * is a best-effort per-instance throttle, not a globally hard limit. It still
 * meaningfully slows brute-force from a single client. For a hard cross-instance
 * guarantee, swap the Map for Redis/Upstash and keep this same interface.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Clear a key — call on a successful login so a good user isn't penalised. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// Opportunistic cleanup so the Map can't grow unbounded on a long-lived
// instance. Cheap: only sweeps when the Map gets sizeable.
function sweep(): void {
  if (buckets.size < 5000) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function rateLimitWithSweep(
  key: string,
  maxAttempts: number,
  windowMs: number,
): RateLimitResult {
  sweep();
  return rateLimit(key, maxAttempts, windowMs);
}
