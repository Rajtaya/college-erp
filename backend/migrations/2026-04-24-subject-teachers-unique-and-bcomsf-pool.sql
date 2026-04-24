-- ============================================================================
-- Migration: 2026-04-24
-- Applied to LOCAL college_erp DB on Apr 24, 2026
-- Apply to Railway DB by: mysql -h ... railway < this_file.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. subject_teachers: widen unique key to include academic_year_id + semester
-- ----------------------------------------------------------------------------
-- Problem: same teacher/subject/section/programme combo was unique across
--   all terms. That prevented tracking assignments across Jan + July semesters.
-- Fix: include academic_year_id + semester so each term gets its own row.
-- Safe on empty tables; if table has rows, verify no NULL ay/sem collisions.
-- ----------------------------------------------------------------------------

ALTER TABLE subject_teachers
  DROP INDEX uq_subject_teacher_section,
  ADD UNIQUE KEY uq_subject_teacher_full
    (subject_id, teacher_id, section, programme_id, academic_year_id, semester);

-- ----------------------------------------------------------------------------
-- 2. B.Com SF programme_subject_pool: backfill from B.Com
-- ----------------------------------------------------------------------------
-- B.Com SF (self-financed) shares the same academic MAJOR subjects as B.Com
-- but had an empty pool. This copies all B.Com pool rows to B.Com SF.
-- INSERT IGNORE makes it safe to re-run.
--
-- Assumes: programme_id 6 = B.Com, programme_id 7 = B.Com SF
-- Verify on target DB before running:
--   SELECT programme_id, programme_name FROM programmes
--     WHERE programme_name IN ('B.Com','B.Com SF');
-- ----------------------------------------------------------------------------

INSERT IGNORE INTO programme_subject_pool (programme_id, subject_id, semester, is_mandatory)
SELECT 7, psp.subject_id, psp.semester, psp.is_mandatory
FROM programme_subject_pool psp
WHERE psp.programme_id = 6;

-- ----------------------------------------------------------------------------
-- Post-migration sanity check (run manually after applying):
--
-- SHOW INDEXES FROM subject_teachers;
--   -- Expect 6-column uq_subject_teacher_full
--
-- SELECT p.programme_name, s.semester, COUNT(*) AS major_count
-- FROM programme_subject_pool psp
-- JOIN programmes p ON psp.programme_id = p.programme_id
-- JOIN subjects s ON psp.subject_id = s.subject_id
-- WHERE p.programme_name IN ('B.Com','B.Com SF') AND s.category = 'MAJOR'
-- GROUP BY p.programme_name, s.semester;
--   -- Expect identical major_count rows for both programmes
-- ----------------------------------------------------------------------------
