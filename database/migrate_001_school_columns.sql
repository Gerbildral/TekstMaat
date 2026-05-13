-- Migration 001: Voeg ontbrekende school-kolommen toe
-- Uitvoeren via: wrangler d1 execute mijnleeshulp-db --file=database/migrate_001_school_columns.sql

ALTER TABLE schools ADD COLUMN brim_code TEXT;
ALTER TABLE schools ADD COLUMN storage_limit_gb INTEGER DEFAULT 10;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_brim_code ON schools(brim_code) WHERE brim_code IS NOT NULL;

-- Zet standaard storage quota op 10GB voor bestaande scholen
UPDATE schools SET storage_limit_gb = 10 WHERE storage_limit_gb IS NULL;
