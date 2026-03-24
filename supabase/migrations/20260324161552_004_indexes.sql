-- ============================================================
-- 004: Performance indexes
-- ============================================================

-- jobs
CREATE INDEX idx_jobs_search ON jobs (status, prefecture, trade_type);
CREATE INDEX idx_jobs_owner ON jobs (owner_id);
CREATE INDEX idx_jobs_created_at ON jobs (created_at);
CREATE INDEX idx_jobs_organization ON jobs (organization_id);

-- applications
CREATE INDEX idx_applications_job_status ON applications (job_id, status);
CREATE INDEX idx_applications_applicant ON applications (applicant_id);

-- messages
CREATE INDEX idx_messages_thread_created ON messages (thread_id, created_at);
CREATE INDEX idx_messages_sender_created ON messages (sender_id, created_at);

-- message_threads
CREATE INDEX idx_message_threads_p1 ON message_threads (participant_1_id);
CREATE INDEX idx_message_threads_p2 ON message_threads (participant_2_id);

-- favorites
CREATE INDEX idx_favorites_user_type ON favorites (user_id, target_type);

-- identity_verifications
CREATE INDEX idx_identity_verifications_status ON identity_verifications (status);

-- subscriptions (for is_paid_user() helper)
CREATE INDEX idx_subscriptions_user_status ON subscriptions (user_id, status);

-- audit_logs
CREATE INDEX idx_audit_logs_actor_created ON audit_logs (actor_id, created_at);

-- organization_members
CREATE INDEX idx_org_members_org_role ON organization_members (organization_id, org_role);

-- user_skills
CREATE INDEX idx_user_skills_user ON user_skills (user_id);

-- scout_templates
CREATE INDEX idx_scout_templates_owner ON scout_templates (owner_id);
CREATE INDEX idx_scout_templates_org ON scout_templates (organization_id);
