// routes/superadmin.ts – Superadmin API routes

import { jsonResponse, errorResponse, successResponse } from '../utils/responses';
import { verifyToken } from '../utils/auth';

export async function handleSuperadmin(request: Request, env: Env, path: string): Promise<Response> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return errorResponse('Niet ingelogd', 401);

  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || payload.role !== 'superadmin') {
    return errorResponse('Geen toegang – superadmin vereist', 403);
  }

  const method = request.method;
  const segments = path.split('/').filter(Boolean); // ['superadmin', ...]

  // GET /superadmin/stats
  if (method === 'GET' && segments[1] === 'stats') {
    return await getStats(env);
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
    env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) as active FROM schools').first<any>(),
    env.DB.prepare('SELECT COUNT(*) as total FROM users WHERE role=\'student\'').first<any>(),
    env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN ocr_status=\'done\' THEN 1 ELSE 0 END) as ocr_done FROM documents').first<any>(),
    env.DB.prepare(`SELECT COUNT(*) as today FROM exam_sessions WHERE date(start_time)=date('now')`).first<any>(),
  ]);

  const expiredLicenses = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM schools WHERE license_expires < datetime('now') AND active=1`
  ).first<any>();

  const ocrQueue = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM documents WHERE ocr_status IN ('pending','processing')`
  ).first<any>();

  // Sessions per day (last 14 days)
  const sessionsPerDay = await env.DB.prepare(`
    SELECT date(start_time) as date, COUNT(*) as count
    FROM exam_sessions
    WHERE start_time >= datetime('now', '-14 days')
    GROUP BY date(start_time)
    ORDER BY date ASC
  `).all();

  // Recent activity
  const recentActivity = await env.DB.prepare(`
    SELECT sl.action, sl.created_at, u.name as user_name, s.name as school
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
    storage_gb: 0, // Would compute from R2 listing in production
    sessions_today: sessions?.today ?? 0,
    licenses_expired: expiredLicenses?.cnt ?? 0,
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
      s.id, s.name, s.code, s.contact_name as contact, s.contact_email as email,
      s.plan, s.storage_limit_gb, s.max_students, s.license_expires, s.active,
      COUNT(DISTINCT u.id) FILTER (WHERE u.role='student') as students,
      COUNT(DISTINCT d.id) as documents
    FROM schools s
    LEFT JOIN users u ON u.school_id = s.id
    LEFT JOIN documents d ON d.school_id = s.id
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
  await env.DB.prepare(`
    INSERT INTO schools (id, name, code, contact_name, contact_email, plan, storage_limit_gb, max_students, license_expires, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    id,
    body.name.trim(),
    body.code?.trim() || null,
    body.contact_name?.trim() || null,
    body.contact_email?.trim() || null,
    body.plan || 'basic',
    body.storage_limit_gb || 10,
    body.max_students || (body.plan === 'enterprise' ? 9999 : body.plan === 'standard' ? 500 : 100),
    getLicenseExpiry(body.plan),
  ).run();

  // Create first admin if provided
  if (body.admin_email && body.admin_password) {
    const { hashPassword } = await import('../utils/auth');
    const hashed = await hashPassword(body.admin_password);
    const adminId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO users (id, school_id, email, password_hash, name, role, active)
      VALUES (?, ?, ?, ?, ?, 'schooladmin', 1)
    `).bind(adminId, id, body.admin_email.trim(), hashed, body.admin_name?.trim() || body.admin_email).run();
  }

  return successResponse({ id }, 'School aangemaakt', 201);
}

/* ──────────────────────────────────────────────────────────────
   Update school
────────────────────────────────────────────────────────────── */
async function updateSchool(id: string, body: any, env: Env): Promise<Response> {
  await env.DB.prepare(`
    UPDATE schools
    SET name=?, code=?, contact_name=?, contact_email=?, plan=?, storage_limit_gb=?, max_students=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    body.name, body.code, body.contact_name, body.contact_email,
    body.plan, body.storage_limit_gb, body.max_students, id
  ).run();
  return successResponse({}, 'School bijgewerkt');
}

/* ──────────────────────────────────────────────────────────────
   Delete school
────────────────────────────────────────────────────────────── */
async function deleteSchool(id: string, env: Env): Promise<Response> {
  // Soft delete: deactivate and mark deleted
  await env.DB.prepare(`UPDATE schools SET active=0, name=name||'_deleted_'||strftime('%s','now') WHERE id=?`).bind(id).run();
  return successResponse({}, 'School verwijderd');
}

/* ──────────────────────────────────────────────────────────────
   Toggle active
────────────────────────────────────────────────────────────── */
async function toggleActive(id: string, active: boolean, env: Env): Promise<Response> {
  await env.DB.prepare(`UPDATE schools SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(active ? 1 : 0, id).run();
  return successResponse({}, active ? 'School geactiveerd' : 'School uitgeschakeld');
}

/* ──────────────────────────────────────────────────────────────
   Update license
────────────────────────────────────────────────────────────── */
async function updateLicense(id: string, body: any, env: Env): Promise<Response> {
  await env.DB.prepare(`
    UPDATE schools SET plan=?, max_students=?, storage_limit_gb=?, license_expires=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).bind(body.plan, body.max_students, body.storage_limit_gb, body.license_expires, id).run();
  return successResponse({}, 'Licentie bijgewerkt');
}

/* ──────────────────────────────────────────────────────────────
   Impersonate (generate short-lived admin token)
────────────────────────────────────────────────────────────── */
async function impersonateSchoolAdmin(schoolId: string, env: Env): Promise<Response> {
  const admin = await env.DB.prepare(
    `SELECT id, name, email, role FROM users WHERE school_id=? AND role='schooladmin' AND active=1 LIMIT 1`
  ).bind(schoolId).first<any>();
  if (!admin) return errorResponse('Geen actieve admin gevonden voor deze school');

  const { createToken } = await import('../utils/auth');
  const token = await createToken({ ...admin, school_id: schoolId, impersonated: true }, env.JWT_SECRET, 1); // 1 hour
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
    env.DB.prepare('SELECT id, name, email, role, active FROM users WHERE school_id=?').bind(schoolId).all(),
    env.DB.prepare('SELECT id, name, mime_type, ocr_status, created_at FROM documents WHERE school_id=?').bind(schoolId).all(),
    env.DB.prepare('SELECT * FROM exam_sessions WHERE school_id=?').bind(schoolId).all(),
  ]);
  const data = { school, users: users.results, documents: docs.results, sessions: sessions.results, exported_at: new Date().toISOString() };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="school-export-${schoolId}.json"` }
  });
}

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
function getLicenseExpiry(plan: string): string {
  const d = new Date();
  if (plan === 'trial') d.setDate(d.getDate() + 30);
  else if (plan === 'basic') d.setFullYear(d.getFullYear() + 1);
  else if (plan === 'standard') d.setFullYear(d.getFullYear() + 1);
  else d.setFullYear(d.getFullYear() + 3); // enterprise
  return d.toISOString();
}
