/**
 * A small in-process throttle for the sign-in endpoint.
 *
 * Deliberately modest: it holds counters in memory, so on a serverless host each instance keeps
 * its own view and a determined attacker spread across instances gets more attempts than the
 * number below suggests. It is there to make online password guessing tedious, not impossible —
 * the real protections are bcrypt hashing and the identical error message for unknown accounts.
 * If this ever faces the open internet at scale, move the counters to the database or a KV store.
 */

type Bucket = { count: number; firstAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60_000;
const MAX_KEYS = 5_000;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkRate(key: string, now = Date.now()): RateVerdict {
  const bucket = buckets.get(key);

  if (bucket && bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 0, firstAt: now, blockedUntil: 0 });
  }
  return { allowed: true };
}

/** Call after a failed attempt. Returns the verdict for the *next* attempt. */
export function recordFailure(key: string, now = Date.now()): RateVerdict {
  // Cheap eviction so a long-running process can't grow this map without bound.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.blockedUntil < now && now - b.firstAt > WINDOW_MS) buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }

  const bucket = buckets.get(key) ?? { count: 0, firstAt: now, blockedUntil: 0 };
  bucket.count += 1;

  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    bucket.count = 0;
    bucket.firstAt = now;
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000) };
  }

  buckets.set(key, bucket);
  return { allowed: true };
}

export function clearRate(key: string): void {
  buckets.delete(key);
}
