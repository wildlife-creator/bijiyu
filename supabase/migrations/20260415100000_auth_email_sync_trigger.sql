-- ============================================================
-- Sync auth.users.email -> public.users.email on email change
-- ============================================================
-- When a user changes their email via Supabase Auth (Secure email
-- change flow = old + new both confirm), auth.users.email is
-- updated. public.users.email must stay in sync so that RLS
-- policies, UI queries, and analytics reading public.users.email
-- see the latest value.
--
-- The existing INSERT trigger (005_auth_trigger.sql) only handles
-- initial user creation. This migration adds an UPDATE trigger
-- covering subsequent email changes.

CREATE OR REPLACE FUNCTION handle_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users
      SET email = NEW.email
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_email_change();
