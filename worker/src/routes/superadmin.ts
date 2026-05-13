// routes/superadmin.ts – Superadmin API routes

import type { Env } from '../index';
import { jsonResponse, errorResponse, successResponse } from '../utils/responses';
import { verifyJWT, createJWT, hashPassword } from '../utils/auth';

export async function handleSuperadmin(request: Request, env: Env, path: string): Promise<Response> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return errorResponse('Niet ingelogd', 401);

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || payload.role !== 'superadmin') {
    return errorResponse('Geen toegang – superadmin vereist', 403);
  }

  const method = request.method;
  const segments = path.split('/').filter(Boolean); // ['superadmin', ...]

  // GET /superadmin/stats
  if (method === 'GET' && segments[1] === 'stats') {
    return await getStats(env);
  }

  // GET /superadmin/health
  if (method === 'GET' && segments[1] === 'health') {
    return await getHealth(env);
  }

  // GET /superadmin/schools/by-brim/:brim_code
  if (method === 'GET' && segments[1] === 'schools' && segments[2] === 'by-brim' && segments[3]) {
    return await getSchoolByBrim(segments[3], env);
  }

  // GET /superadmin/login-attempts
  if (method === 'GET' && segments[1] === 'login-attempts') {
    return await getLoginAttempts(request, env);
  }

  // GET /superadmin/schools
  if (method === 'GET' && segments[1] === 'schools' && !segments[2]) {
    return await listSchools(env);
  }

  // POST /superadmin/schools
  if (method === 'POST' && segments[1] === 'schools' && !segments[2]) {
    const body = await request.json() as any;
    return await createSchool(body, env);
  }

  // PUT /superadmin/schools/:id
  if (method === 'PUT' && segments[1] === 'schools' && segments[2]) {
    const body = await request.json() as any;
    return await updateSchool(segments[2], body, env);
  }

  // DELETE /superadmin/schools/:id
  if (method === 'DELETE' && segments[1] === 'schools' && segments[2] && !segments[3]) {
    return await deleteSchool(segments[2], env);
  }

  // PATCH /superadmin/schools/:id/active
  if (method === 'PATCH' && segments[1] === 'schools' && segments[2] && segments[3] === 'active') {
    const body = await request.json() as any;
    return await toggleActive(segments[2], body.active, env);
  }

  // PATCH /superadmin/schools/:id/license
  if (method === 'PATCH' && segments[1] === 'schools' && segments[2] && segments[3] === 'license') {
    const body = await request.json() as any;
    return await updateLicense(segments[2], body, env);
  }

  // POST /superadmin/schools/:id/impersonate
  if (method === 'POST' && segments[1] === 'schools' && segments[2] && segments[3] === 'impersonate') {
    return await impersonateSchoolAdmin(segments[2], env);
  }

  // POST /superadmin/schools/:id/ocr/retry
  if (method === 'POST' && segments[1] === 'schools' && segments[2] && segments[3] === 'ocr') {
    return await retryOcr(segments[2], env);
  }

  // GET /superadmin/schools/:id/export
  if (method === 'GET' && segments[1] === 'schools' && segments[2] && segments[3] === 'export') {
    return await exportSchool(segments[2], env);
  }

  return errorResponse('Niet gevonden', 404);
}

/* ──────────────────────────────────────────────────────────────
   Stats
────────────────────────────────────────────────────────────── */
async function getStats(env: Env): Promise<Response> {
  const [schools, students, docs, sessions] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active FROM schools WHERE name NOT LIKE '%_deleted_%'`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) as total FROM users WHERE role='student' AND is_active=1`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN ocr_status='done' THEN 1 ELSE 0 END) as ocr_done FROM documents WHERE is_active=1`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) as today FROM exam_sessions WHERE date(available_from)=date('now') AND is_active=1`).first<any>(),
  ]);

  const inactiveSchools = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM schools WHERE is_active=0 AND name NOT LIKE '%_deleted_%'`
  ).first<any>();

  const ocrQueue = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM documents WHERE ocr_status IN ('pending','processing')`
  ).first<any>();

  const sessionsPerDay = await env.DB.prepare(`
    SELECT date(available_from) as date, COUNT(*) as count
    FROM exam_sessions
    WHERE available_from >= datetime('now', '-14 days')
    GROUP BY date(available_from)
    ORDER BY date ASC
  `).all();

  const recentActivity = await env.DB.prepare(`
    SELECT sl.action, sl.created_at,
           u.first_name || ' ' || u.last_name as user_name,
           s.name as school
    FROM session_logs sl
    JOIN users u ON sl.user_id = u.id
    JOIN schools s ON u.school_id = s.id
    ORDER BY sl.created_at DESC
    LIMIT 8
  `).all();

  return jsonResponse({
    schools_active: schools?.active ?? 0,
    schools_total: schools?.total ?? 0,
    students_total: students?.total ?? 0,
    documents_total: docs?.total ?? 0,
    documents_ocr: docs?.ocr_done ?? 0,
    storage_gb: 0,
    sessions_today: sessions?.today ?? 0,
    schools_inactive: inactiveSchools?.cnt ?? 0,
    ocr_queue: ocrQueue?.cnt ?? 0,
    sessions_per_day: sessionsPerDay.results,
    recent_activity: recentActivity.results,
  });
}

/* ──────────────────────────────────────────────────────────────
   List schools
────────────────────────────────────────────────────────────── */
async function listSchools(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT
      s.id, s.name,
      s.brim_code,
      s.contact_name as contact,
      s.contact_email as email,
      s.license_type as plan,
      COALESCE(s.storage_limit_gb, 10) as storage_limit_gb,
      s.max_students,
      s.license_expires_at as license_expires,
      s.is_active as active,
      s.created_at,
      COUNT(DISTINCT CASE WHEN u.role='student' AND u.is_active=1 THEN u.id END) as students,
      COUNT(DISTINCT CASE WHEN d.is_active=1 THEN d.id END) as documents
    FROM schools s
    LEFT JOIN users u ON u.school_id = s.id
    LEFT JOIN documents d ON d.school_id = s.id
    WHERE s.name NOT LIKE '%_deleted_%'
    GROUP BY s.id
    ORDER BY s.name ASC
  `).all();
  return jsonResponse({ schools: result.results });
}

/* ──────────────────────────────────────────────────────────────
   Create school
────────────────────────────────────────────────────────────── */
async function createSchool(body: any, env: Env): Promise<Response> {
  if (!body.name?.trim()) return errorResponse('Schoolnaam is verplicht');

  const id = crypto.randomUUID();
  const slug = body.name.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    + '-' + Date.now().toString(36);

  await env.DB.prepare(`
    INSERT INTO schools (id, name, slug, brim_code, contact_name, contact_email, license_type, storage_limit_gb, max_students, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 'standard', ?, ?, 1)
  `).bind(
    id, body.name.trim(), slug,
    body.brim_code?.trim().toUpperCase() || null,
    body.contact_name?.trim() || null,
    body.contact_email?.trim() || null,
    body.storage_limit_gb || 10,
    body.max_students || 100,
  ).run();

  if (body.admin_email && body.admin_password) {
    const nameParts = (body.admin_name?.trim() || '').split(' ');
    const firstName = nameParts[0] || 'Beheerder';
    const lastName = nameParts.slice(1).join(' ') || '';
    const hashed = await hashPassword(body.admin_password);
    await env.DB.prepare(`
      INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 'schooladmin', 1)
    `).bind(crypto.randomUUID(), id, body.admin_email.trim(), hashed, firstName, lastName).run();
  }

  return jsonResponse({ success: true, data: { id }, message: 'School aangemaakt' }, 201);
}

/* ──────────────────────────────────────────────────────────────
   Update school
────────────────────────────────────────────────────────────── */
async function updateSchool(id: string, body: any, env: Env): Promise<Response> {
  await env.DB.prepare(`
    UPDATE schools
    SET name=?, brim_code=?, contact_name=?, contact_email=?, storage_limit_gb=?, max_students=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    body.name, body.brim_code?.trim().toUpperCase() || null, body.contact_name || null, body.contact_email || null,
    body.storage_limit_gb || 10, body.max_students || 100, id
  ).run();
  return successResponse({}, 'School bijgewerkt');
}

/* ──────────────────────────────────────────────────────────────
   Delete school
────────────────────────────────────────────────────────────── */
async function deleteSchool(id: string, env: Env): Promise<Response> {
  await env.DB.prepare(`UPDATE schools SET is_active=0, name=name||'_deleted_'||strftime('%s','now') WHERE id=?`).bind(id).run();
  return successResponse({}, 'School verwijderd');
}

/* ──────────────────────────────────────────────────────────────
   Toggle active
────────────────────────────────────────────────────────────── */
async function toggleActive(id: string, active: boolean, env: Env): Promise<Response> {
  await env.DB.prepare(`UPDATE schools SET is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(active ? 1 : 0, id).run();
  return successResponse({}, active ? 'School geactiveerd' : 'School uitgeschakeld');
}

/* ──────────────────────────────────────────────────────────────
   Update license
────────────────────────────────────────────────────────────── */
async function updateLicense(id: string, body: any, env: Env): Promise<Response> {
  await env.DB.prepare(`
    UPDATE schools SET max_students=?, storage_limit_gb=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).bind(body.max_students, body.storage_limit_gb, id).run();
  return successResponse({}, 'Licentie bijgewerkt');
}

/* ──────────────────────────────────────────────────────────────
   Impersonate (generate short-lived admin token)
────────────────────────────────────────────────────────────── */
async function impersonateSchoolAdmin(schoolId: string, env: Env): Promise<Response> {
  const admin = await env.DB.prepare(
    `SELECT id, first_name, last_name, email, role FROM users WHERE school_id=? AND role='schooladmin' AND is_active=1 LIMIT 1`
  ).bind(schoolId).first<any>();
  if (!admin) return errorResponse('Geen actieve admin gevonden voor deze school');

  const token = await createJWT({ ...admin, school_id: schoolId }, env.JWT_SECRET, 1);
  return jsonResponse({ token });
}

/* ──────────────────────────────────────────────────────────────
   Retry OCR
────────────────────────────────────────────────────────────── */
async function retryOcr(schoolId: string, env: Env): Promise<Response> {
  await env.DB.prepare(
    `UPDATE documents SET ocr_status='pending', ocr_error=NULL WHERE school_id=? AND ocr_status='failed'`
  ).bind(schoolId).run();
  return successResponse({}, 'OCR herstart voor mislukte documenten');
}

/* ──────────────────────────────────────────────────────────────
   Export school data (basic JSON dump)
────────────────────────────────────────────────────────────── */
async function exportSchool(schoolId: string, env: Env): Promise<Response> {
  const [school, users, docs, sessions] = await Promise.all([
    env.DB.prepare('SELECT * FROM schools WHERE id=?').bind(schoolId).first(),
    env.DB.prepare('SELECT id, first_name, last_name, email, role, is_active FROM users WHERE school_id=?').bind(schoolId).all(),
    env.DB.prepare('SELECT id, title, file_type, ocr_status, created_at FROM documents WHERE school_id=?').bind(schoolId).all(),
    env.DB.prepare('SELECT * FROM exam_sessions WHERE school_id=?').bind(schoolId).all(),
  ]);
  const data = { school, users: users.results, documents: docs.results, sessions: sessions.results, exported_at: new Date().toISOString() };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="school-export-${schoolId}.json"` }
  });
}

/* ──────────────────────────────────────────────────────────────
   School by BRIM code (voor koppelen gebruikers)
────────────────────────────────────────────────────────────── */
async function getSchoolByBrim(brimCode: string, env: Env): Promise<Response> {
  const school = await env.DB.prepare(`
    SELECT id, name, brim_code, contact_name as contact, contact_email as email,
           max_students, is_active as active
    FROM schools
    WHERE brim_code = ? AND is_active = 1 AND name NOT LIKE '%_deleted_%'
  `).bind(brimCode.trim().toUpperCase()).first<any>();

  if (!school) return errorResponse('Geen actieve school gevonden met deze BRIM-code', 404);
  return jsonResponse({ school });
}

/* ──────────────────────────────────────────────────────────────
   Login attempts
────────────────────────────────────────────────────────────── */
async function getLoginAttempts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const school = url.searchParams.get('school') || '';
  const successFilter = url.searchParams.get('success');
  const date = url.searchParams.get('date') || '';

  let query = `
    SELECT la.id, la.email, la.ip_address, la.success, la.created_at,
           u.first_name || ' ' || u.last_name as user_name,
           s.id as school_id, s.name as school_name
    FROM login_attempts la
    LEFT JOIN users u ON la.email = u.email
    LEFT JOIN schools s ON u.school_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (school) {
    query += ' AND s.id = ?';
    params.push(school);
  }
  if (successFilter !== null && successFilter !== '') {
    query += ' AND la.success = ?';
    params.push(successFilter === '1' || successFilter === 'true' ? 1 : 0);
  }
  if (date) {
    query += ' AND date(la.created_at) = ?';
    params.push(date);
  }

  query += ' ORDER BY la.created_at DESC LIMIT 200';

  const result = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ attempts: result.results });
}

/* ──────────────────────────────────────────────────────────────
   System health
────────────────────────────────────────────────────────────── */
async function getHealth(env: Env): Promise<Response> {
  const components: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];

  // Worker API – als dit antwoord geeft is hij up
  components.push({ name: 'Worker API', status: 'ok', message: 'Operationeel' });

  // D1 Database
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<any>();
    components.push({ name: 'D1 Database', status: 'ok', message: `${row?.cnt ?? 0} gebruikers` });
  } catch {
    components.push({ name: 'D1 Database', status: 'error', message: 'Verbindingsfout' });
  }

  // KV Cache
  try {
    await env.SESSIONS.get('__health_check__');
    components.push({ name: 'KV Cache', status: 'ok', message: 'Operationeel' });
  } catch {
    components.push({ name: 'KV Cache', status: 'error', message: 'Verbindingsfout' });
  }

  // R2 Opslag
  try {
    await env.FILES_BUCKET.list({ limit: 1 });
    components.push({ name: 'R2 Opslag', status: 'ok', message: 'Operationeel' });
  } catch {
    components.push({ name: 'R2 Opslag', status: 'error', message: 'Verbindingsfout' });
  }

  // AI / OCR queue
  try {
    const queue = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM documents WHERE ocr_status IN ('pending','processing')`
    ).first<any>();
    const cnt = queue?.cnt ?? 0;
    components.push({
      name: 'AI / OCR',
      status: cnt > 10 ? 'warn' : 'ok',
      message: cnt > 0 ? `Wachtrij: ${cnt} items` : 'Geen wachtrij',
    });
  } catch {
    components.push({ name: 'AI / OCR', status: 'warn', message: 'Status onbekend' });
  }

  return jsonResponse({ components });
}

