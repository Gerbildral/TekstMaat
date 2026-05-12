/**
 * Exam Sessions routes: /api/sessions/*
 */

import type { Env, AuthUser } from '../index';
import { requireRole, requireSchoolAccess, generateId } from '../utils/auth';
import { errorResponse, successResponse, paginatedResponse, jsonResponse } from '../utils/responses';

export async function handleSessions(request: Request, env: Env, user: AuthUser, path: string): Promise<Response> {
  const method = request.method;
  const segments = path.split('/').filter(Boolean);
  const sessionId = segments[1];
  const subPath = segments[2];

  if (method === 'GET' && !sessionId) return listSessions(request, env, user);
  if (method === 'POST' && !sessionId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return createSession(request, env, user);
  }
  if (method === 'GET' && sessionId && !subPath) return getSession(request, env, user, sessionId);
  if (method === 'PUT' && sessionId && !subPath) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return updateSession(request, env, user, sessionId);
  }
  if (method === 'DELETE' && sessionId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return deleteSession(request, env, user, sessionId);
  }
  if (method === 'GET' && sessionId && subPath === 'text') return getDocumentText(request, env, user, sessionId);
  if (method === 'POST' && sessionId && subPath === 'log') return logAction(request, env, user, sessionId);

  return errorResponse('Route niet gevonden', 404);
}

async function listSessions(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;

  let query: string;
  let params: any[];

  if (user.role === 'student') {
    // Studenten zien alleen hun actieve sessies
    query = `
      SELECT es.*, d.title as document_title, d.file_type, d.ocr_status,
             d.page_count, d.language as document_language
      FROM exam_sessions es
      JOIN documents d ON d.id = es.document_id
      JOIN session_access sa ON sa.session_id = es.id
      WHERE es.school_id = ?
      AND es.is_active = 1
      AND es.available_from <= datetime('now')
      AND es.available_until >= datetime('now')
      AND (sa.user_id = ? OR sa.group_id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      ))
      GROUP BY es.id
      ORDER BY es.available_until ASC
    `;
    params = [user.school_id, user.id, user.id];
  } else if (user.role === 'schooladmin') {
    query = `
      SELECT es.*, d.title as document_title, d.file_type, d.ocr_status,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM exam_sessions es
      JOIN documents d ON d.id = es.document_id
      LEFT JOIN users u ON u.id = es.created_by
      WHERE es.school_id = ?
      ORDER BY es.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [user.school_id, perPage, offset];
  } else {
    query = `
      SELECT es.*, d.title as document_title, s.name as school_name
      FROM exam_sessions es
      JOIN documents d ON d.id = es.document_id
      JOIN schools s ON s.id = es.school_id
      ORDER BY es.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [perPage, offset];
  }

  const results = await env.DB.prepare(query).bind(...params).all<any>();
  return jsonResponse({ success: true, data: results.results });
}

async function createSession(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json() as any;
  const { document_id, title, instructions, available_from, available_until,
          allow_speed_control, allow_voice_selection, allowed_languages,
          group_ids, user_ids } = body;

  if (!document_id || !title || !available_from || !available_until) {
    return errorResponse('Verplichte velden ontbreken');
  }

  const schoolId = user.role === 'superadmin' ? body.school_id : user.school_id;
  if (!schoolId) return errorResponse('School is verplicht');

  // Controleer of document beschikbaar is
  const doc = await env.DB.prepare(
    'SELECT id, school_id FROM documents WHERE id = ? AND is_active = 1'
  ).bind(document_id).first<any>();
  if (!doc) return errorResponse('Document niet gevonden');
  if (!requireSchoolAccess(user, doc.school_id)) return errorResponse('Geen toegang tot dit document', 403);

  const sessionId = generateId();

  await env.DB.prepare(`
    INSERT INTO exam_sessions (id, school_id, document_id, created_by, title, instructions,
      available_from, available_until, allow_speed_control, allow_voice_selection, allowed_languages)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId, schoolId, document_id, user.id, title, instructions || null,
    available_from, available_until,
    allow_speed_control !== false ? 1 : 0,
    allow_voice_selection !== false ? 1 : 0,
    allowed_languages ? JSON.stringify(allowed_languages) : null
  ).run();

  // Koppel groepen
  if (group_ids?.length) {
    for (const gid of group_ids) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO session_access (session_id, group_id) VALUES (?, ?)'
      ).bind(sessionId, gid).run();
    }
  }

  // Koppel individuele studenten
  if (user_ids?.length) {
    for (const uid of user_ids) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO session_access (session_id, user_id) VALUES (?, ?)'
      ).bind(sessionId, uid).run();
    }
  }

  return jsonResponse({ success: true, data: { id: sessionId, title }, message: 'Sessie aangemaakt' }, 201);
}

async function getSession(request: Request, env: Env, user: AuthUser, sessionId: string): Promise<Response> {
  const session = await env.DB.prepare(`
    SELECT es.*, d.title as document_title, d.file_type, d.page_count,
           d.ocr_status, d.language as document_language, d.r2_key
    FROM exam_sessions es
    JOIN documents d ON d.id = es.document_id
    WHERE es.id = ? AND es.is_active = 1
  `).bind(sessionId).first<any>();

  if (!session) return errorResponse('Sessie niet gevonden', 404);

  // Haal toegangsinformatie op
  const access = await env.DB.prepare(`
    SELECT sa.*, g.name as group_name, u.first_name || ' ' || u.last_name as user_name
    FROM session_access sa
    LEFT JOIN groups g ON g.id = sa.group_id
    LEFT JOIN users u ON u.id = sa.user_id
    WHERE sa.session_id = ?
  `).bind(sessionId).all<any>();

  return successResponse({ ...session, access: access.results });
}

async function updateSession(request: Request, env: Env, user: AuthUser, sessionId: string): Promise<Response> {
  const session = await env.DB.prepare(
    'SELECT * FROM exam_sessions WHERE id = ? AND is_active = 1'
  ).bind(sessionId).first<any>();
  if (!session) return errorResponse('Sessie niet gevonden', 404);
  if (!requireSchoolAccess(user, session.school_id)) return errorResponse('Geen toegang', 403);

  const body = await request.json() as any;
  const fields: string[] = [];
  const values: any[] = [];

  const updatable = ['title', 'instructions', 'available_from', 'available_until',
                     'allow_speed_control', 'allow_voice_selection', 'allowed_languages', 'is_active'];

  for (const field of updatable) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(field === 'allowed_languages' && Array.isArray(body[field])
        ? JSON.stringify(body[field]) : body[field]);
    }
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    await env.DB.prepare(
      `UPDATE exam_sessions SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, sessionId).run();
  }

  return successResponse(null, 'Sessie bijgewerkt');
}

async function deleteSession(request: Request, env: Env, user: AuthUser, sessionId: string): Promise<Response> {
  const session = await env.DB.prepare(
    'SELECT * FROM exam_sessions WHERE id = ? AND is_active = 1'
  ).bind(sessionId).first<any>();
  if (!session) return errorResponse('Sessie niet gevonden', 404);
  if (!requireSchoolAccess(user, session.school_id)) return errorResponse('Geen toegang', 403);

  await env.DB.prepare(
    "UPDATE exam_sessions SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
  ).bind(sessionId).run();

  return successResponse(null, 'Sessie verwijderd');
}

async function getDocumentText(request: Request, env: Env, user: AuthUser, sessionId: string): Promise<Response> {
  // Haal de geëxtraheerde tekst op voor TTS gebruik
  const session = await env.DB.prepare(`
    SELECT es.*, d.extracted_text, d.ocr_status
    FROM exam_sessions es
    JOIN documents d ON d.id = es.document_id
    WHERE es.id = ? AND es.is_active = 1
  `).bind(sessionId).first<any>();

  if (!session) return errorResponse('Sessie niet gevonden', 404);

  if (session.ocr_status !== 'done') {
    return jsonResponse({ success: false, ocr_status: session.ocr_status,
      message: 'Tekst wordt nog verwerkt' });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '0');

  let textData = JSON.parse(session.extracted_text || '[]');
  if (page > 0) {
    textData = textData.filter((p: any) => p.page === page);
  }

  return successResponse(textData);
}

async function logAction(request: Request, env: Env, user: AuthUser, sessionId: string): Promise<Response> {
  const { action, metadata } = await request.json() as any;
  if (!action) return errorResponse('Actie is verplicht');

  await env.DB.prepare(
    'INSERT INTO session_logs (id, session_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), sessionId, user.id, action, metadata ? JSON.stringify(metadata) : null).run();

  return successResponse(null);
}
