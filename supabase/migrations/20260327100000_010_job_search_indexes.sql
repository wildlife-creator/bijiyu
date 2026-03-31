-- ============================================================
-- 010: Job search feature — additional indexes and constraints
-- ============================================================

-- Sort index for job search: urgent jobs first, then newest
-- (status, is_urgent DESC, created_at DESC) with partial index on non-deleted
CREATE INDEX IF NOT EXISTS idx_jobs_search_sort
  ON jobs (status, is_urgent DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- Prevent duplicate favorites (race condition protection for optimistic UI)
CREATE UNIQUE INDEX IF NOT EXISTS favorites_unique_user_target
  ON favorites (user_id, target_type, target_id);
