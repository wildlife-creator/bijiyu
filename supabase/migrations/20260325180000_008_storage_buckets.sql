-- Migration 008: Create Storage buckets and RLS policies
-- Buckets: avatars (public), identity-documents (private), ccus-documents (private)

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('identity-documents', 'identity-documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('ccus-documents', 'ccus-documents', false) ON CONFLICT DO NOTHING;

-- avatars: public read, owner-only upload/delete
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "avatars_owner_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- identity-documents: owner read + upload
CREATE POLICY "identity_docs_owner_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'identity-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "identity_docs_owner_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'identity-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ccus-documents: owner read + upload
CREATE POLICY "ccus_docs_owner_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ccus-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "ccus_docs_owner_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ccus-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
