-- ============================================================
-- 001: Enum types and updated_at trigger function
-- ============================================================

-- ========================
-- Enum types
-- ========================

CREATE TYPE user_role AS ENUM ('contractor', 'client', 'staff', 'admin');
CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed');
CREATE TYPE application_status AS ENUM ('applied', 'accepted', 'rejected', 'completed', 'cancelled', 'lost');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled');
CREATE TYPE option_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE option_payment_type AS ENUM ('one_time', 'subscription');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE thread_type AS ENUM ('message', 'scout');
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'staff');
CREATE TYPE webhook_status AS ENUM ('processing', 'completed', 'failed');

-- ========================
-- updated_at auto-update trigger function
-- ========================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
