-- =============================================================================
-- Migration: 2026-04-24 afternoon session
-- Changes:
--   1. Rewritten POST /enrollment/bulk-import (accepts discipline_ids, auto-enrolls MAJORs)
--   2. Split discipline 13 (Computer Science) into 3 disciplines:
--        13  Computer Science                 (B.A only)
--        29  Computer Applications (BCA)      (renamed from "Computer Applications")
--        121 Computer Applications (BCA-AI)   (new)
--   3. Re-tagged 47 subjects to correct discipline:
--        36 C24CAP* → discipline 29 (BCA)
--        11 C25CAA* → discipline 121 (BCA-AI)
--   4. Cleaned cross-programme enrollment contamination for 10 BCA/BCA-AI students
--
-- NOTE: This migration is safe to run on Railway. It does NOT touch student
--       data — the 40 orphan students + their enrollments were a local-only
--       test and don't exist in Railway.
--
-- Ordering: run in the order shown. Each block is wrapped in its own transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BLOCK 1: Rename existing discipline 29 + insert new BCA-AI discipline
-- -----------------------------------------------------------------------------
START TRANSACTION;

-- Rename: "Computer Applications" → "Computer Applications (BCA)"
UPDATE disciplines
SET discipline_name = 'Computer Applications (BCA)'
WHERE discipline_id = 29 AND discipline_name = 'Computer Applications';

-- New discipline for BCA-AI curriculum
INSERT INTO disciplines (discipline_name)
SELECT 'Computer Applications (BCA-AI)'
WHERE NOT EXISTS (
  SELECT 1 FROM disciplines WHERE discipline_name = 'Computer Applications (BCA-AI)'
);

COMMIT;

-- Capture the new ID into a session variable for use below
SET @bca_ai_id = (SELECT discipline_id FROM disciplines WHERE discipline_name = 'Computer Applications (BCA-AI)');
SELECT @bca_ai_id AS bca_ai_discipline_id;

-- -----------------------------------------------------------------------------
-- BLOCK 2: Re-tag BCA curriculum subjects: discipline 13 → 29
-- -----------------------------------------------------------------------------
-- Applies to 36 subjects with subject_code LIKE 'C24CAP%'
-- (BCA-exclusive pool; safe to move off Computer Science)
START TRANSACTION;

UPDATE subjects
SET discipline_id = 29
WHERE subject_code LIKE 'C24CAP%'
  AND discipline_id = 13;

COMMIT;

-- -----------------------------------------------------------------------------
-- BLOCK 3: Re-tag BCA-AI curriculum subjects: discipline 13 → new BCA-AI ID
-- -----------------------------------------------------------------------------
-- Applies to 11 subjects with subject_code LIKE 'C25CAA%'
-- (BCA-AI-exclusive pool; safe to move off Computer Science)
START TRANSACTION;

UPDATE subjects
SET discipline_id = @bca_ai_id
WHERE subject_code LIKE 'C25CAA%'
  AND discipline_id = 13;

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICATION QUERIES — run these after the migration to confirm
-- -----------------------------------------------------------------------------
-- Expected: 3 rows (13, 29, and the new ID)
SELECT discipline_id, discipline_name
FROM disciplines
WHERE discipline_id = 13
   OR discipline_name LIKE 'Computer Applications%'
ORDER BY discipline_id;

-- Expected: Computer Science (13) → 12 subjects (all B.A C24COS*)
SELECT COUNT(*) AS cs_subjects FROM subjects WHERE discipline_id = 13;

-- Expected: Computer Applications (BCA) (29) → 36 subjects
SELECT COUNT(*) AS bca_subjects FROM subjects WHERE discipline_id = 29;

-- Expected: Computer Applications (BCA-AI) → 11 subjects
SELECT COUNT(*) AS bca_ai_subjects
FROM subjects
WHERE discipline_id = (SELECT discipline_id FROM disciplines WHERE discipline_name = 'Computer Applications (BCA-AI)');
