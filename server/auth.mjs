import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Use a password of at least 12 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
export function validPasswordHash(value) { return /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value || ''); }
export async function verifyPassword(password, hash) {
  if (!validPasswordHash(hash) || typeof password !== 'string' || password.length > 1024) return false;
  const [, , , , salt, key] = hash.split('$');
  return timingSafeEqual(await derive(password, salt, 64, options), Buffer.from(key, 'hex'));
}
export function signSession(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
export function verifySession(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 1024) return null;
    const [data, signature, extra] = token.split('.'); if (!data || !signature || extra) return null;
    const wanted = createHmac('sha256', secret).update(data).digest(); const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return /^[a-f0-9-]{36}$/.test(payload.id) && Number.isSafeInteger(payload.exp) && payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}
export function sessionCookie(value, production, maxAge = 8 * 60 * 60) {
  return `seminar_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
}
