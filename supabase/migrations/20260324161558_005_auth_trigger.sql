-- ============================================================
-- 005: Auth trigger - auto-create public.users on signup
-- ============================================================

-- When a new user signs up via Supabase Auth, automatically create
-- a corresponding row in public.users with the default role 'contractor'.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role, email)
  VALUES (
    NEW.id,
    'contractor',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
