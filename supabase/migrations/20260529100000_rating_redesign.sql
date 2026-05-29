-- ============================================================================
-- rating-redesign: user_reviews schema replacement
-- 発注者→受注者の評価を「6項目 Good/Bad(text)」→「7項目 ★×5(smallint 1..5)」へ全置換。
-- WARNING: This migration TRUNCATEs user_reviews data. Test environment only.
-- 対象は user_reviews のみ。client_reviews(CON-013)は類似カラムを持つがスコープ外。
-- See .kiro/specs/rating-redesign/ for context.
-- ============================================================================

-- 1. Drop existing RLS policies (recreated identically at the end)
DROP POLICY IF EXISTS "user_reviews_select" ON user_reviews;
DROP POLICY IF EXISTS "user_reviews_insert" ON user_reviews;

-- 2. Truncate test data (no inbound FK to user_reviews → CASCADE unnecessary)
TRUNCATE TABLE user_reviews;

-- 3. Drop old Good/Bad columns
ALTER TABLE user_reviews
  DROP COLUMN rating_again,
  DROP COLUMN rating_follows_instructions,
  DROP COLUMN rating_punctual,
  DROP COLUMN rating_speed,
  DROP COLUMN rating_quality,
  DROP COLUMN rating_has_tools;

-- 4. Add new 7 star-rating columns (overall = NOT NULL, others NULL allowed; 1..5)
ALTER TABLE user_reviews
  ADD COLUMN rating_overall               smallint NOT NULL CHECK (rating_overall               BETWEEN 1 AND 5),
  ADD COLUMN rating_punctual              smallint     NULL CHECK (rating_punctual              BETWEEN 1 AND 5),
  ADD COLUMN rating_follows_instructions  smallint     NULL CHECK (rating_follows_instructions  BETWEEN 1 AND 5),
  ADD COLUMN rating_speed                 smallint     NULL CHECK (rating_speed                 BETWEEN 1 AND 5),
  ADD COLUMN rating_quality               smallint     NULL CHECK (rating_quality               BETWEEN 1 AND 5),
  ADD COLUMN rating_has_tools             smallint     NULL CHECK (rating_has_tools             BETWEEN 1 AND 5),
  ADD COLUMN rating_has_special_equipment smallint     NULL CHECK (rating_has_special_equipment BETWEEN 1 AND 5);

-- 5. Index for aggregation queries (FK does not auto-create an index in PostgreSQL)
CREATE INDEX user_reviews_reviewee_id_idx ON user_reviews(reviewee_id);

-- 6. Recreate RLS policies (identical to original behavior)
-- Public read
CREATE POLICY "user_reviews_select" ON user_reviews
  FOR SELECT TO authenticated
  USING (true);

-- Reviewer can insert (further checks in Server Action)
CREATE POLICY "user_reviews_insert" ON user_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- No update/delete policies → denied by default
