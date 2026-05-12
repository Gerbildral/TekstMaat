/**
 * Schools routes: /api/schools/*
 */
import type { Env, AuthUser } from '../index';
import { requireRole, requireSchoolAccess, generateId, hashPassword } from '../utils/auth';
import { errorResponse, successResponse, jsonResponse } from '../utils/responses';

export async function handleSchools(request: Request, env: Env, user: AuthUser, path: string): Promise<Response> {
  const method = request.method;
  const segments = path.split('/').filter(Boolean);
  const schoolId = segments[1];

  if (!requireRole(user, 'superadmin', 'schooladmin')) {
    return errorResponse('Geen toegang', 403);
  }

  if (method === 'GET' && !schoolId) {
    if (!requireRole(user, 'superadmin')) return errorResponse('Geen toegang', 403);
    const schools = await env.DB.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM users WHERE school_id = s.id AND is_active = 1) as user_count,
        (SELECT COUNT(*) FROM documents WHERE school_id = s.id AND is_active = 1) as document_count
      FROM schools s ORDER BY s.name
    `).all<any>();
    return jsonResponse({ success: true, data: schools.results });
  }

  if (method === 'GET' && schoolId) {
    if (!requireRole(user, 'superadmin') && user.school_id !== schoolId) {
      return errorResponse('Geen toegang', 403);
    }
    const school = await env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first();
    if (!school) return errorResponse('School niet gevonden', 404);
    return successResponse(school);
  }

  if (method === 'POST' && !schoolId) {
    if (!requireRole(user, 'superadmin')) return errorResponse('Geen toegang', 403);
    const body = await request.json() as any;
    const { name, contact_email, contact_name, license_type, max_students, allowed_languages } = body;
    if (!name || !contact_email) return errorResponse('Naam en e-mailadres zijn verplicht');

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = generateId();

    await env.DB.prepare(`
      INSERT INTO schools (id, name, slug, contact_email, contact_name, license_type, max_students, allowed_languages)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, slug, contact_email, contact_name || '', license_type || 'standard',
            max_students || 100, JSON.stringify(allowed_languages || ['nl', 'en'])).run();

    return jsonResponse({ success: true, data: { id, name, slug }, message: 'School aangemaakt' }, 201);
  }

  if (method === 'PUT' && schoolId) {
    if (!requireRole(user, 'superadmin') && user.school_id !== schoolId) {
      return errorResponse('Geen toegang', 403);
    }
    const body = await request.json() as any;
    const updates: string[] = [];
    const values: any[] = [];
    const fields = ['name', 'contact_email', 'contact_name', 'license_type', 'max_students', 'is_active'];
    for (const f of fields) {
      if (body[f] !== undefined) { updates.push(`${f} = ?`); values.push(body[f]); }
    }
    if (body.allowed_languages) {
      updates.push('allowed_languages = ?');
      values.push(JSON.stringify(body.allowed_languages));
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      await env.DB.prepare(`UPDATE schools SET ${updates.join(', ')} WHERE id = ?`).bind(...values, schoolId).run();
    }
    return successResponse(null, 'School bijgewerkt');
  }

  return errorResponse('Route niet gevonden', 404);
}

/**
 * Users routes: /api/users/*
 */
export async function handleUsers(request: Request, env: Env, user: AuthUser, path: string): Promise<Response> {
  const method = request.method;
  const segments = path.split('/').filter(Boolean);
  const userId = segments[1];

  if (method === 'GET' && !userId) return listUsers(request, env, user);
  if (method === 'POST' && !userId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return createUser(request, env, user);
  }
  if (method === 'GET' && userId) return getUser(request, env, user, userId);
  if (method === 'PUT' && userId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return updateUser(request, env, user, userId);
  }
  if (method === 'DELETE' && userId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);
    return deleteUser(request, env, user, userId);
  }

  return errorResponse('Route niet gevonden', 404);
}

async function listUsers(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const search = url.searchParams.get('search') || '';

  let query = `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.student_number,
                      u.is_active, u.last_login_at, u.created_at, s.name as school_name
               FROM users u LEFT JOIN schools s ON s.id = u.school_id
               WHERE 1=1`;
  const params: any[] = [];

  if (user.role === 'schooladmin') {
    query += ' AND u.school_id = ?';
    params.push(user.school_id);
  } else if (user.role === 'student') {
    return errorResponse('Geen toegang', 403);
  }

  if (role) { query += ' AND u.role = ?'; params.push(role); }
  if (search) {
    query += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.student_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY u.last_name, u.first_name';
  const results = await env.DB.prepare(query).bind(...params).all<any>();
  return jsonResponse({ success: true, data: results.results });
}

async function createUser(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json() as any;
  const { email, password, first_name, last_name, role, student_number } = body;

  if (!email || !password || !first_name || !last_name || !role) {
    return errorResponse('Verplichte velden ontbreken');
  }

  // Schooladmin mag alleen studenten en admins aanmaken voor hun eigen school
  if (user.role === 'schooladmin') {
    if (!['schooladmin', 'student'].includes(role)) {
      return errorResponse('U mag alleen school-admins en studenten aanmaken');
    }
  }

  const schoolId = user.role === 'superadmin' ? body.school_id : user.school_id;
  if (role !== 'superadmin' && !schoolId) return errorResponse('School is verplicht');

  // Check of e-mail al bestaat
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return errorResponse('Dit e-mailadres is al in gebruik');

  const id = generateId();
  const hash = await hashPassword(password);

  await env.DB.prepare(`
    INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, student_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, schoolId || null, email.toLowerCase(), hash, first_name, last_name, role, student_number || null).run();

  return jsonResponse({ success: true, data: { id, email, first_name, last_name, role }, message: 'Gebruiker aangemaakt' }, 201);
}

async function getUser(request: Request, env: Env, user: AuthUser, userId: string): Promise<Response> {
  // Gebruiker mag eigen profiel altijd zien
  if (userId === 'me') userId = user.id;

  const target = await env.DB.prepare(
    `SELECT id, email, first_name, last_name, role, student_number, school_id, is_active, created_at, last_login_at
     FROM users WHERE id = ?`
  ).bind(userId).first();

  if (!target) return errorResponse('Gebruiker niet gevonden', 404);
  return successResponse(target);
}

async function updateUser(request: Request, env: Env, user: AuthUser, userId: string): Promise<Response> {
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>();
  if (!target) return errorResponse('Gebruiker niet gevonden', 404);

  if (!requireSchoolAccess(user, target.school_id) && user.id !== userId) {
    return errorResponse('Geen toegang', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.first_name) { updates.push('first_name = ?'); values.push(body.first_name); }
  if (body.last_name) { updates.push('last_name = ?'); values.push(body.last_name); }
  if (body.student_number !== undefined) { updates.push('student_number = ?'); values.push(body.student_number); }
  if (body.is_active !== undefined && requireRole(user, 'superadmin', 'schooladmin')) {
    updates.push('is_active = ?'); values.push(body.is_active);
  }
  if (body.password) {
    updates.push('password_hash = ?');
    values.push(await hashPassword(body.password));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values, userId).run();
  }

  return successResponse(null, 'Gebruiker bijgewerkt');
}

async function deleteUser(request: Request, env: Env, user: AuthUser, userId: string): Promise<Response> {
  if (userId === user.id) return errorResponse('U kunt uzelf niet verwijderen');
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>();
  if (!target) return errorResponse('Gebruiker niet gevonden', 404);
  if (!requireSchoolAccess(user, target.school_id)) return errorResponse('Geen toegang', 403);

  await env.DB.prepare("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(userId).run();
  return successResponse(null, 'Gebruiker gedeactiveerd');
}

/**
 * Groups routes: /api/groups/*
 */
export async function handleGroups(request: Request, env: Env, user: AuthUser, path: string): Promise<Response> {
  if (!requireRole(user, 'superadmin', 'schooladmin')) return errorResponse('Geen toegang', 403);

  const method = request.method;
  const segments = path.split('/').filter(Boolean);
  const groupId = segments[1];
  const subPath = segments[2];

  if (method === 'GET' && !groupId) {
    const schoolId = user.role === 'superadmin'
      ? (new URL(request.url).searchParams.get('school_id') || '')
      : user.school_id;
    const groups = await env.DB.prepare(`
      SELECT g.*, COUNT(gm.user_id) as member_count
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      WHERE g.school_id = ?
      GROUP BY g.id ORDER BY g.name
    `).bind(schoolId).all<any>();
    return jsonResponse({ success: true, data: groups.results });
  }

  if (method === 'POST' && !groupId) {
    const body = await request.json() as any;
    const schoolId = user.role === 'superadmin' ? body.school_id : user.school_id;
    const id = generateId();
    await env.DB.prepare('INSERT INTO groups (id, school_id, name, description) VALUES (?, ?, ?, ?)')
      .bind(id, schoolId, body.name, body.description || null).run();
    return jsonResponse({ success: true, data: { id, name: body.name } }, 201);
  }

  if (method === 'DELETE' && groupId) {
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return successResponse(null, 'Groep verwijderd');
  }

  // Leden beheren
  if (groupId && subPath === 'members') {
    if (method === 'POST') {
      const { user_id } = await request.json() as any;
      await env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)')
        .bind(groupId, user_id).run();
      return successResponse(null, 'Lid toegevoegd');
    }
    if (method === 'DELETE') {
      const url = new URL(request.url);
      const uid = url.searchParams.get('user_id');
      if (uid) await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, uid).run();
      return successResponse(null, 'Lid verwijderd');
    }
    if (method === 'GET') {
      const members = await env.DB.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.student_number
        FROM group_members gm JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ? ORDER BY u.last_name
      `).bind(groupId).all<any>();
      return jsonResponse({ success: true, data: members.results });
    }
  }

  return errorResponse('Route niet gevonden', 404);
}

export async function handleOCR(request: Request, env: Env, user: AuthUser, path: string): Promise<Response> {
  return errorResponse('OCR route', 404);
}
