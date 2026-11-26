/*
  # User Profiles & Phone Alert Subscriptions

  1. New Table: `user_profiles`
    - Stores phone number and device alert preferences for authenticated users
  2. Security:
    - RLS enabled with `TO authenticated` and `(select auth.uid()) = id`
*/

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  full_name text,
  alerts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE INDEX IF NOT EXISTS user_profiles_alerts_enabled_idx
  ON public.user_profiles (alerts_enabled)
  WHERE alerts_enabled = true;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, phone, alerts_enabled)
  VALUES (NEW.id, NEW.phone, true)
  ON CONFLICT (id) DO UPDATE
    SET phone = COALESCE(EXCLUDED.phone, public.user_profiles.phone),
        updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
