-- Migration 009: Create job-attachments Storage bucket and RLS policies

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-attachments', 'job-attachments', true)
ON CONFLICT DO NOTHING;

-- Authenticated users can upload to their own userId folder
CREATE POLICY "job_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own files
CREATE POLICY "job_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public bucket: anyone can read
CREATE POLICY "job_attachments_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'job-attachments');
