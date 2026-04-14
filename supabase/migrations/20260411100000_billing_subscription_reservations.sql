-- ============================================================
-- billing: subscriptions reservation cache columns + client_profiles UNIQUE
-- ============================================================
--
-- Adds the columns required to cache Stripe Subscription Schedule /
-- cancel_at_period_end state in the local DB, so CLI-026 can render
-- reservation status without round-trips to Stripe API.
--
-- Also adds UNIQUE (user_id) on client_profiles, which is required by
-- handle_checkout_completed_plan() (Task 1.2) which uses
-- INSERT ... ON CONFLICT (user_id) DO UPDATE.

-- ------------------------------------------------------------
-- subscriptions: reservation cache columns
-- ------------------------------------------------------------

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS schedule_id text,
  ADD COLUMN IF NOT EXISTS scheduled_plan_type text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN subscriptions.schedule_id IS
  'Stripe Subscription Schedule ID for downgrade reservation (null when no reservation)';
COMMENT ON COLUMN subscriptions.scheduled_plan_type IS
  'Target plan_type after the scheduled downgrade applies';
COMMENT ON COLUMN subscriptions.scheduled_at IS
  'Timestamp when the scheduled change becomes effective (= current_period_end)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS
  'Whether subscription is set to cancel at the end of the current billing period';

-- ------------------------------------------------------------
-- client_profiles: UNIQUE (user_id) so RPC ON CONFLICT works
-- ------------------------------------------------------------

ALTER TABLE client_profiles
  ADD CONSTRAINT client_profiles_user_id_unique UNIQUE (user_id);
