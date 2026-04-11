-- ============================================================
-- message_threads: organization_id column + org-based RLS
-- 組織ベーススレッドモデル対応
-- ============================================================

-- Add organization_id column (nullable: individual plans have NULL)
ALTER TABLE message_threads
  ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Index for org-based thread lookup
CREATE INDEX idx_message_threads_org ON message_threads (organization_id)
  WHERE organization_id IS NOT NULL;

-- Unique constraint: 1 org × 1 contractor = 1 thread
CREATE UNIQUE INDEX idx_message_threads_org_contractor_unique
  ON message_threads (organization_id, participant_2_id)
  WHERE organization_id IS NOT NULL;

-- Drop old SELECT/INSERT policies and recreate with org support
DROP POLICY IF EXISTS "message_threads_select" ON message_threads;
DROP POLICY IF EXISTS "message_threads_insert" ON message_threads;

-- SELECT: participant OR org member
CREATE POLICY "message_threads_select" ON message_threads
  FOR SELECT TO authenticated
  USING (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

-- INSERT: participant OR org member
CREATE POLICY "message_threads_insert" ON message_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

-- UPDATE: allow thread_type changes (message -> scout) by participants/org members
CREATE POLICY "message_threads_update_type" ON message_threads
  FOR UPDATE TO authenticated
  USING (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

-- ============================================================
-- messages: scout_status column + UPDATE RLS
-- スカウト応答をメッセージレベルで管理
-- ============================================================

-- Add scout_status to messages (not threads)
ALTER TABLE messages
  ADD COLUMN scout_status text;

-- CHECK: scout messages must have scout_status, non-scout messages must not
ALTER TABLE messages
  ADD CONSTRAINT messages_scout_status_check
  CHECK (
    (is_scout = false AND scout_status IS NULL)
    OR (is_scout = true AND scout_status IN ('pending', 'accepted', 'rejected'))
  );

-- Drop old messages policies and recreate with org support
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update_read" ON messages;

-- SELECT: messages in threads user can access
CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_threads
      WHERE id = messages.thread_id
      AND (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
      )
    )
  );

-- INSERT: send to threads user can access
CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM message_threads
      WHERE id = messages.thread_id
      AND (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
      )
    )
  );

-- UPDATE: read_at and scout_status are both updated via admin client (service_role)
-- to avoid PERMISSIVE policy conflicts. Server Actions handle permission checks.
-- No UPDATE RLS policy needed (admin client bypasses RLS).

-- ============================================================
-- Enable Realtime for messages table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- organizations: allow thread participants to see org name
-- Without this, contractors cannot see the org name in thread list
-- because the existing organizations_select policy only allows org members.
-- ============================================================
CREATE POLICY "organizations_select_thread_participant" ON organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_threads
      WHERE message_threads.organization_id = organizations.id
      AND message_threads.participant_2_id = auth.uid()
    )
  );
