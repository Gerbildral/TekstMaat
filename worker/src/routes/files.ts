/**
 * File serving routes: /api/files/*
 * Dient bestanden uit R2 met toegangscontrole
 */

import type { Env, AuthUser } from '../index';
import { requireSchoolAccess } from '../utils/auth';
import { errorResponse, corsHeaders } from '../utils/responses';

export async function handleFiles(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Methode niet toegestaan', 405);
  }

  // Path: /files/schools/{schoolId}/documents/{docId}/...
  const r2Key = decodeURIComponent(path.replace('/files/', ''));

  if (!r2Key) return errorResponse('Geen bestandspad opgegeven');

  // Extraheer school ID uit het pad voor toegangscontrole
  const schoolMatch = r2Key.match(/^schools\/([^/]+)\//);
  if (schoolMatch) {
    const schoolId = schoolMatch[1];

    // Controleer of gebruiker toegang heeft
    if (!requireSchoolAccess(user, schoolId)) {
      // Student: controleer of ze toegang hebben via een sessie
      if (user.role === 'student') {
        // Haal document op via r2Key
        const document = await env.DB.prepare(
          'SELECT id, school_id FROM documents WHERE r2_key = ?'
        ).bind(r2Key).first<any>();

        if (document) {
          const hasAccess = await env.DB.prepare(`
            SELECT 1 FROM exam_sessions es
            JOIN session_access sa ON sa.session_id = es.id
            WHERE es.document_id = ?
            AND es.is_active = 1
            AND es.available_from <= datetime('now')
            AND es.available_until >= datetime('now')
            AND (sa.user_id = ? OR sa.group_id IN (
              SELECT group_id FROM group_members WHERE user_id = ?
            ))
            LIMIT 1
          `).bind(document.id, user.id, user.id).first();

          if (!hasAccess) return errorResponse('Geen toegang tot dit bestand', 403);
        } else {
          return errorResponse('Bestand niet gevonden', 404);
        }
      } else {
        return errorResponse('Geen toegang tot dit bestand', 403);
      }
    }
  }

  // Haal bestand op uit R2
  const object = await env.FILES_BUCKET.get(r2Key);
  if (!object) {
    return errorResponse('Bestand niet gevonden', 404);
  }

  // Stuur bestand terug met juiste headers
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', object.httpEtag);

  // CORS headers voor cross-origin toegang vanuit de browser
  const cors = corsHeaders(env);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value as string);
  }

  // Range support voor PDF streaming
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1]);
      const end = match[2] ? parseInt(match[2]) : undefined;

      const rangedObject = await env.FILES_BUCKET.get(r2Key, {
        range: { offset: start, length: end ? end - start + 1 : undefined }
      });

      if (rangedObject) {
        const size = object.size;
        const rangeEnd = end || size - 1;
        headers.set('Content-Range', `bytes ${start}-${rangeEnd}/${size}`);
        headers.set('Content-Length', String(rangeEnd - start + 1));

        return new Response(rangedObject.body, {
          status: 206,
          headers,
        });
      }
    }
  }

  // Voeg Content-Length toe
  headers.set('Content-Length', String(object.size));

  return new Response(object.body, { headers });
}
