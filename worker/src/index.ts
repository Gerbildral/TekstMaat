/**
 * TEKSTMAAT - Cloudflare Worker API
 * Hoofdrouter voor alle API verzoeken
 */

import { handleAuth } from './routes/auth';
import { handleSchools, handleUsers, handleGroups, handleOCR } from './routes/schools';
import { handleDocuments } from './routes/documents';
import { handleSessions } from './routes/sessions';
import { handleFiles } from './routes/files';
import { corsHeaders, errorResponse } from './utils/responses';
import { verifyJWT } from './utils/auth';

export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  SESSIONS: KVNamespace;
  AI: any;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  APP_URL: string;
  // Workers Sites – automatisch aangemaakt door Wrangler via [site] in wrangler.toml
  __STATIC_CONTENT: KVNamespace;
  __STATIC_CONTENT_MANIFEST: string;
}

export interface AuthUser {
  id: string;
  school_id: string | null;
  email: string;
  role: 'superadmin' | 'schooladmin' | 'student';
  first_name: string;
  last_name: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // Serve frontend voor niet-API routes
    if (!path.startsWith('/api/')) {
      return serveStaticAsset(request, env);
    }

    try {
      // API routing
      const apiPath = path.replace('/api', '');

      // Publieke routes (geen auth vereist)
      if (apiPath.startsWith('/auth/')) {
        return handleAuth(request, env, apiPath);
      }

      // Beveiligde routes - JWT verificatie
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return errorResponse('Geen toegang - inloggen vereist', 401);
      }

      const token = authHeader.slice(7);
      const user = await verifyJWT(token, env.JWT_SECRET);
      if (!user) {
        return errorResponse('Ongeldige of verlopen sessie', 401);
      }

      // Route naar juiste handler
      if (apiPath.startsWith('/schools')) return handleSchools(request, env, user, apiPath);
      if (apiPath.startsWith('/users')) return handleUsers(request, env, user, apiPath);
      if (apiPath.startsWith('/documents')) return handleDocuments(request, env, user, apiPath);
      if (apiPath.startsWith('/sessions')) return handleSessions(request, env, user, apiPath);
      if (apiPath.startsWith('/groups')) return handleGroups(request, env, user, apiPath);
      if (apiPath.startsWith('/files')) return handleFiles(request, env, user, apiPath);
      if (apiPath.startsWith('/ocr')) return handleOCR(request, env, user, apiPath);

      return errorResponse('Route niet gevonden', 404);

    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Interne serverfout', 500);
    }
  },

  // Scheduled handler voor cleanup taken
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Verwijder verlopen sessie logs ouder dan 90 dagen
    await env.DB.prepare(
      `DELETE FROM session_logs WHERE created_at < datetime('now', '-90 days')`
    ).run();

    // Verwijder verlopen login pogingen ouder dan 7 dagen
    await env.DB.prepare(
      `DELETE FROM login_attempts WHERE created_at < datetime('now', '-7 days')`
    ).run();
  }
};

async function serveStaticAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;

  // Root redirect naar login
  if (pathname === '/' || pathname === '') pathname = '/login.html';

  const key = pathname.replace(/^\//, '');

  try {
    const manifest: Record<string, string> = JSON.parse(env.__STATIC_CONTENT_MANIFEST);
    let hashedKey = manifest[key];

    // Probeer index.html als de map wordt opgevraagd (bijv. /admin/)
    if (!hashedKey) {
      const indexKey = key.replace(/\/?$/, 'index.html').replace(/^\//, '');
      hashedKey = manifest[indexKey] || manifest[indexKey.replace('index.html', '/index.html').replace(/^\//, '')];
      if (!hashedKey) return new Response('Pagina niet gevonden', { status: 404 });
    }

    const content = await env.__STATIC_CONTENT.get(hashedKey, { type: 'arrayBuffer' });
    if (!content) return new Response('Bestand niet gevonden', { status: 404 });

    const ext = key.split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      css:  'text/css; charset=utf-8',
      js:   'application/javascript; charset=utf-8',
      json: 'application/json',
      png:  'image/png',
      jpg:  'image/jpeg',
      svg:  'image/svg+xml',
      ico:  'image/x-icon',
      woff2:'font/woff2',
      woff: 'font/woff',
    };

    return new Response(content, {
      headers: {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': ext === 'html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response('Fout bij laden van pagina: ' + e, { status: 500 });
  }
}