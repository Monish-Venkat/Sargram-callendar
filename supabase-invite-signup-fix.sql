-- Run in the Supabase SQL Editor after supabase-password-only-signup.sql.
-- Gives the sign-up screen an exact, safe status and ignores accidental
-- spaces/case differences in invited email addresses.
CREATE OR REPLACE FUNCTION public.get_password_signup_status(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE normalized_email TEXT := LOWER(TRIM(p_email));
BEGIN
  IF normalized_email IS NULL OR normalized_email = '' THEN RETURN 'not_invited'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(TRIM(email)) = normalized_email) THEN
    RETURN 'account_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invites WHERE LOWER(TRIM(email)) = normalized_email) THEN
    RETURN 'eligible';
  END IF;
  RETURN 'not_invited';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_password_account(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.get_password_signup_status(p_email) = 'eligible';
$$;

REVOKE ALL ON FUNCTION public.get_password_signup_status(TEXT), public.can_create_password_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_password_signup_status(TEXT), public.can_create_password_account(TEXT) TO anon, authenticated;
