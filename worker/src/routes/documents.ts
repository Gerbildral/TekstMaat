/**
 * Document routes: /api/documents/*
 * Beheert PDF/DOCX upload, OCR verwerking en opvragen
 */

import type { Env, AuthUser } from '../index';
import { requireRole, requireSchoolAccess, generateId } from '../utils/auth';
import { jsonResponse, errorResponse, successResponse, paginatedResponse } from '../utils/responses';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function handleDocuments(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string
): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);
  const segments = path.split('/').filter(Boolean);
  const docId = segments[1];

  // GET /api/documents - lijst alle documenten van school
  if (method === 'GET' && !docId) {
    return listDocuments(request, env, user);
  }

  // POST /api/documents - upload nieuw document
  if (method === 'POST' && !docId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) {
      return errorResponse('Geen toegang om documenten te uploaden', 403);
    }
    return uploadDocument(request, env, user);
  }

  // GET /api/documents/:id - document details
  if (method === 'GET' && docId && !segments[2]) {
    return getDocument(request, env, user, docId);
  }

  // DELETE /api/documents/:id - verwijder document
  if (method === 'DELETE' && docId) {
    if (!requireRole(user, 'superadmin', 'schooladmin')) {
      return errorResponse('Geen toegang om documenten te verwijderen', 403);
    }
    return deleteDocument(request, env, user, docId);
  }

  // POST /api/documents/:id/reprocess - opnieuw verwerken
  if (method === 'POST' && docId && segments[2] === 'reprocess') {
    if (!requireRole(user, 'superadmin', 'schooladmin')) {
      return errorResponse('Geen toegang', 403);
    }
    return reprocessDocument(request, env, user, docId);
  }

  return errorResponse('Route niet gevonden', 404);
}

async function listDocuments(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;
  const search = url.searchParams.get('search') || '';

  let whereClause = 'WHERE d.is_active = 1';
  const params: any[] = [];

  // Studenten zien alleen documenten van hun sessies
  if (user.role === 'student') {
    whereClause += ` AND d.school_id = ? AND EXISTS (
      SELECT 1 FROM exam_sessions es
      JOIN session_access sa ON sa.session_id = es.id
      WHERE es.document_id = d.id
      AND es.is_active = 1
      AND es.available_from <= datetime('now')
      AND es.available_until >= datetime('now')
      AND (sa.user_id = ? OR sa.group_id IN (
        SELECT group_id FROM group_members WHERE user_id = ?
      ))
    )`;
    params.push(user.school_id, user.id, user.id);
  } else if (user.role === 'schooladmin') {
    whereClause += ' AND d.school_id = ?';
    params.push(user.school_id);
  }
  // superadmin ziet alles

  if (search) {
    whereClause += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.original_filename LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM documents d ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const documents = await env.DB.prepare(
    `SELECT d.id, d.title, d.description, d.original_filename, d.file_type,
            d.file_size, d.language, d.page_count, d.ocr_status,
            d.created_at, d.updated_at,
            u.first_name || ' ' || u.last_name as uploaded_by_name,
            s.name as school_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     LEFT JOIN schools s ON s.id = d.school_id
     ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, perPage, offset).all<any>();

  return paginatedResponse(documents.results, countResult?.total || 0, page, perPage);
}

async function uploadDocument(request: Request, env: Env, user: AuthUser): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string || '';
    const language = formData.get('language') as string || 'nl';
    const schoolId = user.role === 'superadmin'
      ? (formData.get('school_id') as string)
      : user.school_id;

    if (!file) return errorResponse('Geen bestand geselecteerd');
    if (!title) return errorResponse('Titel is verplicht');
    if (!schoolId) return errorResponse('School is verplicht');

    // Controleer bestandstype
    const fileType = ALLOWED_TYPES[file.type];
    if (!fileType) {
      return errorResponse('Ongeldig bestandstype. Alleen PDF en DOCX zijn toegestaan.');
    }

    // Controleer bestandsgrootte
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`Bestand te groot. Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
    }

    const docId = generateId();
    const timestamp = Date.now();
    const r2Key = `schools/${schoolId}/documents/${docId}/${timestamp}-${file.name}`;

    // Upload naar R2
    const fileBuffer = await file.arrayBuffer();
    await env.FILES_BUCKET.put(r2Key, fileBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `inline; filename="${file.name}"`,
      },
      customMetadata: {
        schoolId,
        docId,
        originalName: file.name,
      }
    });

    // Sla document op in database
    await env.DB.prepare(`
      INSERT INTO documents (id, school_id, uploaded_by, title, description,
        original_filename, file_type, file_size, r2_key, language, ocr_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'done')
    `).bind(docId, schoolId, user.id, title, description,
            file.name, fileType, file.size, r2Key, language).run();

    return jsonResponse({
      success: true,
      data: {
        id: docId,
        title,
        file_type: fileType,
        file_size: file.size,
        ocr_status: 'done',
        r2_key: r2Key,
      },
      message: 'Document succesvol geüpload.'
    }, 201);

  } catch (err) {
    console.error('Upload fout:', err);
    return errorResponse('Fout bij uploaden', 500);
  }
}

async function getDocument(request: Request, env: Env, user: AuthUser, docId: string): Promise<Response> {
  const document = await env.DB.prepare(`
    SELECT d.*, u.first_name || ' ' || u.last_name as uploaded_by_name, s.name as school_name
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    LEFT JOIN schools s ON s.id = d.school_id
    WHERE d.id = ? AND d.is_active = 1
  `).bind(docId).first<any>();

  if (!document) return errorResponse('Document niet gevonden', 404);

  // Toegangscontrole
  if (!requireSchoolAccess(user, document.school_id)) {
    // Studenten: check of ze toegang hebben via een sessie
    if (user.role === 'student') {
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
      `).bind(docId, user.id, user.id).first();

      if (!hasAccess) return errorResponse('Geen toegang tot dit document', 403);
    } else {
      return errorResponse('Geen toegang tot dit document', 403);
    }
  }

  // Genereer tijdelijke signed URL voor R2 bestand
  const signedUrl = await generateR2SignedUrl(env, document.r2_key);

  // Stuur document info terug (zonder de volledige geëxtraheerde tekst in lijst)
  const { extracted_text, ...docWithoutText } = document;

  return successResponse({
    ...docWithoutText,
    file_url: signedUrl,
    has_extracted_text: !!extracted_text,
  });
}

async function deleteDocument(request: Request, env: Env, user: AuthUser, docId: string): Promise<Response> {
  const document = await env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? AND is_active = 1'
  ).bind(docId).first<any>();

  if (!document) return errorResponse('Document niet gevonden', 404);
  if (!requireSchoolAccess(user, document.school_id)) {
    return errorResponse('Geen toegang', 403);
  }

  // Soft delete in database
  await env.DB.prepare(
    "UPDATE documents SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
  ).bind(docId).run();

  // Verwijder uit R2 (optioneel, kan ook bewaard blijven)
  // await env.FILES_BUCKET.delete(document.r2_key);

  return successResponse(null, 'Document verwijderd');
}

async function reprocessDocument(request: Request, env: Env, user: AuthUser, docId: string): Promise<Response> {
  const document = await env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? AND is_active = 1'
  ).bind(docId).first<any>();

  if (!document) return errorResponse('Document niet gevonden', 404);
  if (!requireSchoolAccess(user, document.school_id)) {
    return errorResponse('Geen toegang', 403);
  }

  await env.DB.prepare(
    "UPDATE documents SET ocr_status = 'pending', extracted_text = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(docId).run();

  startOCRProcessing(env, docId, document.r2_key, document.file_type, document.language).catch(console.error);

  return successResponse(null, 'Herverwerking gestart');
}

function generateR2SignedUrl(env: Env, r2Key: string): string {
  return `${env.CDN_URL}/${r2Key}`;
}

// Start OCR verwerking via Cloudflare AI (asynchroon)
async function startOCRProcessing(env: Env, docId: string, r2Key: string, fileType: string, language: string) {
  await env.DB.prepare(
    "UPDATE documents SET ocr_status = 'processing' WHERE id = ?"
  ).bind(docId).run();

  try {
    // Haal bestand op uit R2
    const file = await env.FILES_BUCKET.get(r2Key);
    if (!file) throw new Error('Bestand niet gevonden in R2');

    const fileBuffer = await file.arrayBuffer();

    let extractedText: any[] = [];

    if (fileType === 'pdf') {
      // Gebruik Cloudflare AI voor PDF verwerking
      // @ts-ignore
      const result = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                document: {
                  type: 'pdf',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))
                  }
                }
              },
              {
                type: 'text',
                text: `Extraheer ALLE tekst uit dit PDF document. 
                Geef de output als JSON array met objecten per pagina:
                [{"page": 1, "text": "volledige tekst van pagina 1"}, ...]
                Zorg dat GEEN tekst wordt overgeslagen. Behoud de originele volgorde.
                Geef ALLEEN de JSON terug, geen andere tekst.`
              }
            ]
          }
        ]
      });

      try {
        const content = result.response || result.content?.[0]?.text || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extractedText = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback: sla volledige tekst op als één pagina
        extractedText = [{ page: 1, text: result.response || '' }];
      }
    }

    // Bepaal aantal pagina's
    const pageCount = extractedText.length || 1;

    await env.DB.prepare(`
      UPDATE documents
      SET ocr_status = 'done',
          extracted_text = ?,
          page_count = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(extractedText), pageCount, docId).run();

  } catch (err) {
    console.error('OCR fout:', err);
    await env.DB.prepare(
      "UPDATE documents SET ocr_status = 'failed', updated_at = datetime('now') WHERE id = ?"
    ).bind(docId).run();
  }
}
