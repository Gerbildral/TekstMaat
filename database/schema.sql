-- ============================================
-- TEKSTMAAT DATABASE SCHEMA
-- Cloudflare D1 (SQLite)
-- ============================================

-- Scholen (beheerd door superadmin)
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  license_type TEXT NOT NULL DEFAULT 'standard', -- standard, premium, enterprise
  license_expires_at TEXT, -- ISO8601 datum
  max_students INTEGER DEFAULT 100,
  max_admins INTEGER DEFAULT 5,
  allowed_languages TEXT DEFAULT '["nl","en"]', -- JSON array
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Gebruikers (superadmin, schooladmin, student)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'schooladmin', 'student')),
  student_number TEXT, -- voor studenten
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Groepen/klassen binnen een school
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Koppeling studenten aan groepen
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Toetsdocumenten (geüpload door schooladmin)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'docx', 'doc')),
  file_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE, -- pad in R2 bucket
  language TEXT DEFAULT 'nl', -- standaard taal voor TTS
  page_count INTEGER,
  -- Verwerkte tekst per pagina (JSON: [{page: 1, text: "...", words: [{word, x, y, w, h}]}])
  extracted_text TEXT,
  ocr_status TEXT DEFAULT 'pending' CHECK(ocr_status IN ('pending', 'processing', 'done', 'failed')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Toetssessies (wanneer een document beschikbaar is voor welke studenten)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  instructions TEXT,
  available_from TEXT NOT NULL, -- ISO8601
  available_until TEXT NOT NULL, -- ISO8601
  allow_speed_control INTEGER DEFAULT 1,
  allow_voice_selection INTEGER DEFAULT 1,
  allowed_languages TEXT, -- JSON array, null = alle beschikbare
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Koppeling sessies aan groepen of individuele studenten
CREATE TABLE IF NOT EXISTS session_access (
  session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  -- ofwel group_id ofwel user_id is ingevuld
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  CHECK (
    (group_id IS NOT NULL AND user_id IS NULL) OR
    (group_id IS NULL AND user_id IS NOT NULL)
  )
);

-- Sessie log (voor gebruik statistieken, geen voortgang opslaan want examen)
CREATE TABLE IF NOT EXISTS session_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES exam_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, -- opened, started_tts, paused_tts, changed_speed, changed_language
  metadata TEXT, -- JSON met extra info
  created_at TEXT DEFAULT (datetime('now'))
);

-- Inlogpogingen (beveiliging)
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL,
  ip_address TEXT,
  success INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes voor performance
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_documents_school ON documents(school_id);
CREATE INDEX IF NOT EXISTS idx_sessions_school ON exam_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_sessions_document ON exam_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_session_access_session ON session_access(session_id);
CREATE INDEX IF NOT EXISTS idx_session_access_user ON session_access(user_id);
CREATE INDEX IF NOT EXISTS idx_session_access_group ON session_access(group_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_user ON session_logs(user_id);

-- Seed: superadmin account (wachtwoord: SuperAdmin123! - VERANDER DIT!)
-- Wachtwoord hash moet gegenereerd worden met bcrypt
INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, role)
VALUES (
  'superadmin-00000000000000000000000000000001',
  'admin@tekstmaat.nl',
  '$2a$10$PLACEHOLDER_HASH_CHANGE_THIS',
  'Super',
  'Admin',
  'superadmin'
);

-- ── Extra kolommen die superadmin gebruikt ────────────────────
-- (Migratie: voeg toe aan bestaande schema's)
-- ALTER TABLE schools ADD COLUMN code TEXT;
-- ALTER TABLE schools ADD COLUMN plan TEXT DEFAULT 'standard';
-- ALTER TABLE schools ADD COLUMN storage_limit_gb INTEGER DEFAULT 10;
-- ALTER TABLE schools ADD COLUMN active INTEGER DEFAULT 1;
-- (active en is_active zijn aliassen; beide worden ondersteund)
-- ALTER TABLE users ADD COLUMN name TEXT; -- full name shorthand
-- ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1;
