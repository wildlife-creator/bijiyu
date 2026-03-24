-- ============================================================
-- 003: Helper functions and RLS policies
-- ============================================================

-- ========================
-- Helper functions (used in RLS policies)
-- ========================

-- Check if user is admin (returns false for soft-deleted users)
CREATE OR REPLACE FUNCTION is_admin(uid uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = uid AND role = 'admin' AND deleted_at IS NULL);
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user has active subscription (includes past_due; returns false for soft-deleted users)
CREATE OR REPLACE FUNCTION is_paid_user(uid uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = uid AND status IN ('active', 'past_due')
    AND user_id IN (SELECT id FROM public.users WHERE deleted_at IS NULL)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user belongs to the given organization (returns false for soft-deleted users)
CREATE OR REPLACE FUNCTION is_same_org(uid uuid, org_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = uid AND organization_id = org_id
    AND user_id IN (SELECT id FROM public.users WHERE deleted_at IS NULL)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ========================
-- Enable RLS on all tables
-- ========================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_available_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE available_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ========================
-- users
-- ========================

-- Public profile info: any authenticated user (exclude soft-deleted)
CREATE POLICY "users_select_public" ON users
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- Admin can see all including soft-deleted
CREATE POLICY "users_select_admin" ON users
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Insert own record (contractor role only via RLS; other roles via Server Action)
CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Update own record only
CREATE POLICY "users_update_self" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No delete (soft delete only)

-- ========================
-- user_skills
-- ========================

-- Public read (via user profile)
CREATE POLICY "user_skills_select" ON user_skills
  FOR SELECT TO authenticated
  USING (true);

-- Own data only for write
CREATE POLICY "user_skills_insert" ON user_skills
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_skills_update" ON user_skills
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_skills_delete" ON user_skills
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ========================
-- user_qualifications
-- ========================

CREATE POLICY "user_qualifications_select" ON user_qualifications
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_qualifications_insert" ON user_qualifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_qualifications_update" ON user_qualifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_qualifications_delete" ON user_qualifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ========================
-- user_available_areas
-- ========================

CREATE POLICY "user_available_areas_select" ON user_available_areas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_available_areas_insert" ON user_available_areas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_available_areas_update" ON user_available_areas
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_available_areas_delete" ON user_available_areas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ========================
-- jobs
-- ========================

-- Open jobs visible to all authenticated users (exclude soft-deleted)
CREATE POLICY "jobs_select_open" ON jobs
  FOR SELECT TO authenticated
  USING (status = 'open' AND deleted_at IS NULL);

-- Owner can see own jobs (all statuses, including soft-deleted for review)
CREATE POLICY "jobs_select_owner" ON jobs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Same org members can see org jobs
CREATE POLICY "jobs_select_org" ON jobs
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_same_org(auth.uid(), organization_id)
    AND deleted_at IS NULL
  );

-- Admin can see all including soft-deleted
CREATE POLICY "jobs_select_admin" ON jobs
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Only paid users can create jobs
CREATE POLICY "jobs_insert" ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (is_paid_user(auth.uid()) AND owner_id = auth.uid());

-- Owner or same org can update (not soft-deleted)
CREATE POLICY "jobs_update" ON jobs
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL AND (
      owner_id = auth.uid()
      OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
    )
  )
  WITH CHECK (
    deleted_at IS NULL AND (
      owner_id = auth.uid()
      OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
    )
  );

-- No delete (soft delete only)

-- ========================
-- job_images
-- ========================

-- Visible if the job is accessible (simplified: all authenticated for non-deleted jobs)
CREATE POLICY "job_images_select" ON job_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs WHERE jobs.id = job_images.job_id AND jobs.deleted_at IS NULL
    )
  );

-- Job owner can manage images
CREATE POLICY "job_images_insert" ON job_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_images.job_id AND jobs.owner_id = auth.uid())
  );

CREATE POLICY "job_images_update" ON job_images
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_images.job_id AND jobs.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_images.job_id AND jobs.owner_id = auth.uid())
  );

CREATE POLICY "job_images_delete" ON job_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_images.job_id AND jobs.owner_id = auth.uid())
  );

-- ========================
-- applications
-- ========================

-- Applicant or job owner can see
CREATE POLICY "applications_select" ON applications
  FOR SELECT TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = applications.job_id AND jobs.owner_id = auth.uid())
  );

-- Admin can see all
CREATE POLICY "applications_select_admin" ON applications
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Authenticated users can apply (further checks in Server Action)
CREATE POLICY "applications_insert" ON applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id = auth.uid());

-- Job owner can update status
CREATE POLICY "applications_update" ON applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = applications.job_id AND jobs.owner_id = auth.uid())
  );

-- Applicant can update own application (e.g., cancel)
CREATE POLICY "applications_update_self" ON applications
  FOR UPDATE TO authenticated
  USING (applicant_id = auth.uid())
  WITH CHECK (applicant_id = auth.uid());

-- ========================
-- user_reviews
-- ========================

-- Public read
CREATE POLICY "user_reviews_select" ON user_reviews
  FOR SELECT TO authenticated
  USING (true);

-- Reviewer can insert (further checks in Server Action)
CREATE POLICY "user_reviews_insert" ON user_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- No update/delete

-- ========================
-- client_reviews
-- ========================

CREATE POLICY "client_reviews_select" ON client_reviews
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "client_reviews_insert" ON client_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- No update/delete

-- ========================
-- message_threads
-- ========================

-- Participants only
CREATE POLICY "message_threads_select" ON message_threads
  FOR SELECT TO authenticated
  USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- Authenticated users can create threads (further checks in Server Action)
CREATE POLICY "message_threads_insert" ON message_threads
  FOR INSERT TO authenticated
  WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- No update/delete

-- ========================
-- messages
-- ========================

-- Only messages in threads the user participates in
CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_threads
      WHERE id = messages.thread_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

-- Send to own threads only
CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM message_threads
      WHERE id = messages.thread_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

-- Allow updating read_at (receiver marks as read)
CREATE POLICY "messages_update_read" ON messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM message_threads
      WHERE id = messages.thread_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

-- ========================
-- subscriptions
-- ========================

-- Own subscription only
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin can see all
CREATE POLICY "subscriptions_select_admin" ON subscriptions
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT/UPDATE: server-side only (service_role key via Stripe Webhook)
-- No policies needed for authenticated users

-- ========================
-- option_subscriptions
-- ========================

CREATE POLICY "option_subscriptions_select" ON option_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "option_subscriptions_select_admin" ON option_subscriptions
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT/UPDATE: server-side only

-- ========================
-- client_profiles
-- ========================

-- Public read
CREATE POLICY "client_profiles_select" ON client_profiles
  FOR SELECT TO authenticated
  USING (true);

-- Own profile or org owner/admin
CREATE POLICY "client_profiles_insert" ON client_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (
      SELECT o.owner_id FROM organizations o
      WHERE o.id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.org_role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "client_profiles_update" ON client_profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT o.owner_id FROM organizations o
      WHERE o.id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.org_role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (
      SELECT o.owner_id FROM organizations o
      WHERE o.id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.org_role IN ('owner', 'admin')
      )
    )
  );

-- ========================
-- organizations
-- ========================

-- Members only
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- Admin can see all
CREATE POLICY "organizations_select_admin" ON organizations
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT/UPDATE: server-side only (admin creates via ADM-006)

-- ========================
-- organization_members
-- ========================

-- Same org members
CREATE POLICY "organization_members_select" ON organization_members
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Admin can see all
CREATE POLICY "organization_members_select_admin" ON organization_members
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE: Server Action with org_role check

-- ========================
-- favorites
-- ========================

CREATE POLICY "favorites_select" ON favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "favorites_insert" ON favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "favorites_delete" ON favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ========================
-- available_schedules
-- ========================

-- Public read (clients check contractor availability)
CREATE POLICY "available_schedules_select" ON available_schedules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "available_schedules_insert" ON available_schedules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "available_schedules_update" ON available_schedules
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "available_schedules_delete" ON available_schedules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ========================
-- identity_verifications
-- ========================

-- Own verifications or admin
CREATE POLICY "identity_verifications_select" ON identity_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Own verification only
CREATE POLICY "identity_verifications_insert" ON identity_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin only (approve/reject)
CREATE POLICY "identity_verifications_update_admin" ON identity_verifications
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- ========================
-- contacts
-- ========================

-- Admin only for reading
CREATE POLICY "contacts_select_admin" ON contacts
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Anyone can submit (including anonymous)
CREATE POLICY "contacts_insert_anon" ON contacts
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "contacts_insert_authenticated" ON contacts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No update/delete

-- ========================
-- scout_templates
-- ========================

-- Own templates or same org templates
CREATE POLICY "scout_templates_select" ON scout_templates
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Own templates (org templates managed via Server Action)
CREATE POLICY "scout_templates_insert" ON scout_templates
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "scout_templates_update" ON scout_templates
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "scout_templates_delete" ON scout_templates
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ========================
-- stripe_webhook_events
-- ========================

-- No access for authenticated users (server-side only via service_role)

-- ========================
-- audit_logs
-- ========================

-- Admin only for reading
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT: server-side only (service_role)
