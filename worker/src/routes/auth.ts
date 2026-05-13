/**
 * Auth routes: /api/auth/*
 */

import type { Env } from '../index';
import { createJWT, verifyPassword, hashPassword, verifyJWT } from '../utils/auth';
import { jsonResponse, errorResponse, successResponse } from '../utils/responses';
import { sendPasswordResetEmail } from '../utils/email';

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;

  // POST /api/auth/login
  if (path === '/auth/login' && method === 'POST') {
    return login(request, env);
  }

  // POST /api/auth/logout
  if (path === '/auth/logout' && method === 'POST') {
    return successResponse(null, 'Uitgelogd');
  }

  // GET /api/auth/me
  if (path === '/auth/me' && method === 'GET') {
    return getMe(request, env);
  }

  // POST /api/auth/reset-password
  if (path === '/auth/reset-password' && method === 'POST') {
    return resetPasswordRequest(request, env);
  }

  // POST /api/auth/set-password (met token)
  if (path === '/auth/set-password' && method === 'POST') {
    return setPassword(request, env);
  }

  return errorResponse('Route niet gevonden', 404);
}

async function login(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { email: string; password: string };
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('E-mailadres en wachtwoord zijn verplicht');
    }

    // Brute force bescherming: max 5 pogingen per 15 minuten
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const attemptsKey = `login_attempts:${ip}:${email}`;
    const attemptsRaw = await env.SESSIONS.get(attemptsKey);
    const attempts = attemptsRaw ? parseInt(attemptsRaw) : 0;

    if (attempts >= 5) {
      return errorResponse('Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.', 429);
    }

    // Zoek gebruiker
    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase()).first<any>();

    if (!user) {
      await env.SESSIONS.put(attemptsKey, String(attempts + 1), { expirationTtl: 900 });
      await env.DB.prepare(
        'INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, ?, 0)'
      ).bind(crypto.randomUUID(), email.toLowerCase(), ip).run();
      return errorResponse('Ongeldig e-mailadres of wachtwoord', 401);
    }

    // Verifieer wachtwoord
    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      await env.SESSIONS.put(attemptsKey, String(attempts + 1), { expirationTtl: 900 });
      await env.DB.prepare(
        'INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, ?, 0)'
      ).bind(crypto.randomUUID(), email.toLowerCase(), ip).run();
      return errorResponse('Ongeldig e-mailadres of wachtwoord', 401);
    }

    // Reset login pogingen
    await env.SESSIONS.delete(attemptsKey);
    await env.DB.prepare(
      'INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, ?, 1)'
    ).bind(crypto.randomUUID(), email.toLowerCase(), ip).run();

    // Update last_login
    await env.DB.prepare(
      "UPDATE users SET last_login_at = datetime('now') WHERE id = ?"
    ).bind(user.id).run();

    // Maak JWT aan
    const tokenPayload = {
      id: user.id,
      school_id: user.school_id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
    };

    const token = await createJWT(tokenPayload, env.JWT_SECRET, 8);

    // Haal school op als van toepassing
    let school = null;
    if (user.school_id) {
      school = await env.DB.prepare(
        'SELECT id, name, slug, allowed_languages FROM schools WHERE id = ?'
      ).bind(user.school_id).first();
    }

    return jsonResponse({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        school_id: user.school_id,
        school,
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return errorResponse('Inlogfout', 500);
  }
}

async function resetPasswordRequest(request: Request, env: Env): Promise<Response> {
  try {
    const { email } = await request.json() as { email: string };
    if (!email) return errorResponse('E-mailadres is verplicht');

    // Genereer reset token (geldig 1 uur)
    const token = crypto.randomUUID();
    const key = `reset:${token}`;
    await env.SESSIONS.put(key, email.toLowerCase(), { expirationTtl: 3600 });

    if (env.ENVIRONMENT === 'development') {
      return successResponse({ reset_token: token }, 'Reset link aangemaakt (dev modus)');
    }

    await sendPasswordResetEmail(env.EMAIL, email.toLowerCase(), token, env.APP_URL, env.FROM_EMAIL);

    return successResponse(null, 'Als het e-mailadres bekend is, ontvang je een reset link');
  } catch {
    return errorResponse('Fout bij aanmaken reset link');
  }
}

async function setPassword(request: Request, env: Env): Promise<Response> {
  try {
    const { token, password } = await request.json() as { token: string; password: string };

    if (!token || !password || password.length < 8) {
      return errorResponse('Ongeldig verzoek of wachtwoord te kort (minimaal 8 tekens)');
    }

    const email = await env.SESSIONS.get(`reset:${token}`);
    if (!email) return errorResponse('Reset link is verlopen of ongeldig', 401);

    const hash = await hashPassword(password);
    const result = await env.DB.prepare(
      'UPDATE users SET password_hash = ? WHERE email = ?'
    ).bind(hash, email).run();

    if (result.meta.changes === 0) return errorResponse('Gebruiker niet gevonden', 404);

    await env.SESSIONS.delete(`reset:${token}`);
    return successResponse(null, 'Wachtwoord succesvol gewijzigd');
  } catch {
    return errorResponse('Fout bij instellen wachtwoord');
  }
}

async function getMe(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Niet ingelogd', 401);
  }
  const user = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
  if (!user) {
    return errorResponse('Ongeldige of verlopen sessie', 401);
  }
  return jsonResponse({
    id: user.id,
    email: user.email,
    role: user.role,
    name: `${user.first_name} ${user.last_name}`.trim(),
    first_name: user.first_name,
    last_name: user.last_name,
    school_id: user.school_id,
  });
}
