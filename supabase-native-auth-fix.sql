-- Run this once in the Supabase SQL Editor for an existing SARGAM project.
-- It makes invite redemption use the verified email in auth.users instead of
-- relying on a custom JWT email claim.

CREATE OR REPLACE FUNCTION public.ensure_member()
RETURNS SETOF public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id TEXT := auth.uid()::TEXT;
  current_email TEXT;
  existing_member public.members%ROWTYPE;
  invite_record public.invites%ROWTYPE;
  new_member public.members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT LOWER(email) INTO current_email
  FROM auth.users
  WHERE id = auth.uid();

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'The signed-in account has no email address';
  END IF;

  SELECT * INTO existing_member FROM public.members WHERE clerk_id = current_user_id;
  IF FOUND THEN
    RETURN NEXT existing_member;
    RETURN;
  END IF;

  -- Safely attach a legacy record when its verified Supabase email matches.
  SELECT * INTO existing_member FROM public.members WHERE LOWER(email) = current_email;
  IF FOUND THEN
    UPDATE public.members SET clerk_id = current_user_id WHERE id = existing_member.id
    RETURNING * INTO new_member;
    RETURN NEXT new_member;
    RETURN;
  END IF;

  SELECT * INTO invite_record FROM public.invites WHERE LOWER(email) = current_email;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.members (clerk_id, email, name, role, event_name)
  VALUES (current_user_id, current_email, invite_record.name, invite_record.role, invite_record.event_name)
  RETURNING * INTO new_member;

  DELETE FROM public.invites WHERE id = invite_record.id;
  RETURN NEXT new_member;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_member() TO authenticated;
