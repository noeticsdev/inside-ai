import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const id = () => randomBytes(16).toString('hex');
export const token = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, encoded] = stored.split(':');
  const key = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export class RateLimit {
  private attempts = new Map<string, { count: number; until: number }>();
  allow(key: string, limit = 12) {
    const now = Date.now();
    if (this.attempts.size > 10000) for (const [k, v] of this.attempts) if (v.until <= now) this.attempts.delete(k);
    const old = this.attempts.get(key);
    const entry = old && old.until > now ? old : { count: 0, until: now + 15 * 60 * 1000 };
    this.attempts.set(key, entry);
    return ++entry.count <= limit;
  }
}
