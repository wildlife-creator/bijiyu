-- ============================================================
-- 002: All tables
-- ============================================================

-- ========================
-- users
-- ========================

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  email text NOT NULL,
  last_name text,
  first_name text,
  gender text,
  birth_date date,
  prefecture text,
  company_name text,
  bio text,
  avatar_url text,
  video_url text,
  is_active boolean NOT NULL DEFAULT true,
  identity_verified boolean NOT NULL DEFAULT false,
  ccus_verified boolean NOT NULL DEFAULT false,
  ccus_worker_id text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- user_skills
-- ========================

CREATE TABLE user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_type text NOT NULL,
  experience_years integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- user_qualifications
-- ========================

CREATE TABLE user_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualification_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- user_available_areas
-- ========================

CREATE TABLE user_available_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prefecture text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- organizations
-- ========================

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- organization_members
-- ========================

CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_role org_role NOT NULL,
  is_proxy_account boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- 1 proxy account per organization
CREATE UNIQUE INDEX organization_members_proxy_unique
  ON organization_members (organization_id) WHERE is_proxy_account = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- jobs
-- ========================

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  prefecture text,
  address text,
  trade_type text,
  headcount integer,
  reward_upper integer,
  reward_lower integer,
  work_start_date date,
  work_end_date date,
  recruit_start_date date,
  recruit_end_date date,
  work_hours text,
  experience_years text,
  required_skills text,
  nationality_language text,
  items text,
  schedule_detail text,
  project_details text,
  owner_message text,
  location text,
  etc_message text,
  status job_status NOT NULL DEFAULT 'draft',
  is_urgent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- job_images
-- ========================

CREATE TABLE job_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  image_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- applications
-- ========================

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  headcount integer,
  working_type text,
  preferred_first_work_date date,
  first_work_date date,
  message text,
  status application_status NOT NULL DEFAULT 'applied',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active applications (cancelled ones are excluded)
CREATE UNIQUE INDEX applications_unique_active
  ON applications (job_id, applicant_id) WHERE status <> 'cancelled';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- user_reviews (client -> contractor)
-- ========================

CREATE TABLE user_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operating_status text,
  status_supplement text,
  rating_again text,
  rating_follows_instructions text,
  rating_punctual text,
  rating_speed text,
  rating_quality text,
  rating_has_tools text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- client_reviews (contractor -> client)
-- ========================

CREATE TABLE client_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operating_status text,
  status_supplement text,
  rating_again text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- message_threads
-- ========================

CREATE TABLE message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_2_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_type thread_type NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON message_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- messages
-- ========================

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proxy_sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  image_url text,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  is_scout boolean NOT NULL DEFAULT false,
  is_proxy boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_proxy_consistency CHECK (
    (is_proxy = false AND proxy_sender_id IS NULL) OR
    (is_proxy = true AND proxy_sender_id IS NOT NULL)
  )
);

-- ========================
-- subscriptions
-- ========================

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  plan_type text NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  past_due_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active/past_due subscription per user
CREATE UNIQUE INDEX subscriptions_unique_active
  ON subscriptions (user_id) WHERE status IN ('active', 'past_due');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- option_subscriptions
-- ========================

CREATE TABLE option_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_profile_id uuid,  -- FK added after client_profiles is created
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  payment_type option_payment_type NOT NULL,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  option_type text NOT NULL,
  status option_status NOT NULL DEFAULT 'active',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT option_subscriptions_payment_consistency CHECK (
    (payment_type = 'one_time' AND stripe_subscription_id IS NULL) OR
    (payment_type = 'subscription' AND stripe_payment_intent_id IS NULL)
  )
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON option_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- client_profiles
-- ========================

CREATE TABLE client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  image_url text,
  recruit_job_types text[],
  recruit_area text,
  employee_scale integer,
  working_way text,
  message text,
  admin_memo text,
  is_urgent_option boolean NOT NULL DEFAULT false,
  is_compensation_5000 boolean NOT NULL DEFAULT false,
  is_compensation_9800 boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from option_subscriptions to client_profiles
ALTER TABLE option_subscriptions
  ADD CONSTRAINT option_subscriptions_client_profile_fk
  FOREIGN KEY (client_profile_id) REFERENCES client_profiles(id) ON DELETE SET NULL;

-- ========================
-- favorites
-- ========================

CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- available_schedules
-- ========================

CREATE TABLE available_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON available_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- identity_verifications
-- ========================

CREATE TABLE identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_url_1 text NOT NULL,
  document_url_2 text,
  ccus_worker_id text,
  status verification_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one pending verification per user per document_type
CREATE UNIQUE INDEX identity_verifications_pending_unique
  ON identity_verifications (user_id, document_type) WHERE status = 'pending';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON identity_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- contacts
-- ========================

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name text NOT NULL,
  first_name text NOT NULL,
  email text NOT NULL,
  contact_types text[] NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- scout_templates
-- ========================

CREATE TABLE scout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- stripe_webhook_events
-- ========================

CREATE TABLE stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  status webhook_status NOT NULL DEFAULT 'processing',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- audit_logs
-- ========================

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
