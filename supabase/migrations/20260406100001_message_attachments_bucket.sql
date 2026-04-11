-- ============================================================
-- message-attachments Storage bucket + RLS policies
-- メッセージ添付画像用（private）
-- ============================================================

-- Create bucket (idempotent: seed.sql may have already created it)
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- INSERT: authenticated users can upload to their own folder
CREATE POLICY "msg_attachments_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: thread participants OR org members can view attachments
CREATE POLICY "msg_attachments_participant_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1 FROM message_threads
      WHERE (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
      )
    )
  );
