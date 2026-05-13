-- Migration 001: Voeg ontbrekende school-kolommen toe
-- Uitvoeren via: wrangler d1 execute mijnleeshulp-db --file=database/migrate_001_school_columns.sql

ALTER TABLE schools ADD COLUMN code TEXT;
ALTER TABLE schools ADD COLUMN storage_limit_gb INTEGER DEFAULT 10;

-- Zet is_active als standaard active-alias (kolom bestaat al, geen actie nodig)
-- Zet license_type als standaard plan-alias (kolom bestaat al, geen actie nodig)

-- Zet standaard storage quota op 10GB voor bestaande scholen
UPDATE schools SET storage_limit_gb = 10 WHERE storage_limit_gb IS NULL;
