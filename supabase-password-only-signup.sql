-- Run once in Supabase SQL Editor.
-- This keeps passwords securely handled by Supabase Auth but lets the app
-- check whether an email is on the approved SARGAM invite list before signup.
CREATE OR REPLACE FUNCTION public.can_create_password_account(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invites
    WHERE LOWER(email) = LOWER(TRIM(p_email))
  )
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE LOWER(email) = LOWER(TRIM(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.can_create_password_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_password_account(TEXT) TO anon, authenticated;
