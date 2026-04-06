-- Add document_urls column to applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS document_urls text[];

-- Create application-documents storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-documents', 'application-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for application-documents bucket
CREATE POLICY "auth_users_upload_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'application-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "auth_users_select_application_documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'application-documents'
  );
