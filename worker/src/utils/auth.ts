/**
 * Auth utilities voor JWT tokens en wachtwoord verificatie
 * Gebruikt Web Crypto API (beschikbaar in Cloudflare Workers)
 */

import type { AuthUser } from '../index';

// JWT aanmaken
export async function createJWT(payload: AuthUser, secret: string, expiresInHours = 8): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + (expiresInHours * 3600),
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encode(header);
  const payloadB64 = encode(claims);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

// JWT verifiëren en decoderen
export async function verifyJWT(token: string, secret: string): Promise<AuthUser | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC', key, signature, new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;

    const decode = (b64: string) => JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
    const payload = decode(payloadB64);

    // Controleer verloopdatum
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload as AuthUser;
  } catch {
    return null;
  }
}

// Wachtwoord hashen met PBKDF2 (Web Crypto API)
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );

  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

// Wachtwoord verifiëren
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!stored.startsWith('pbkdf2:')) return false;
    const [, saltHex, storedHash] = stored.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      256
    );

    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === storedHash;
  } catch {
    return false;
  }
}

// Rol verificatie helpers
export function requireRole(user: AuthUser, ...roles: string[]): boolean {
  return roles.includes(user.role);
}

export function requireSchoolAccess(user: AuthUser, schoolId: string): boolean {
  if (user.role === 'superadmin') return true;
  return user.school_id === schoolId;
}

// Genereer unieke ID
export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
