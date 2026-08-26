-- Run ONCE in Supabase SQL Editor. This makes invited users become members
-- automatically when their Supabase Auth account is created.

CREATE OR REPLACE FUNCTION public.provision_invited_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record public.invites%ROWTYPE;
BEGIN
  SELECT * INTO invite_record
  FROM public.invites
  WHERE LOWER(email) = LOWER(NEW.email);

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.members (clerk_id, email, name, role, event_name)
  VALUES (NEW.id::TEXT, LOWER(NEW.email), invite_record.name, invite_record.role, invite_record.event_name)
  ON CONFLICT (email) DO UPDATE
  SET clerk_id = EXCLUDED.clerk_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      event_name = EXCLUDED.event_name,
      updated_at = NOW();

  DELETE FROM public.invites WHERE id = invite_record.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_provision_member ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_member
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_invited_member();

-- Backfill anyone who created an account before this trigger was installed.
INSERT INTO public.members (clerk_id, email, name, role, event_name)
SELECT u.id::TEXT, LOWER(u.email), i.name, i.role, i.event_name
FROM auth.users u
JOIN public.invites i ON LOWER(i.email) = LOWER(u.email)
ON CONFLICT (email) DO UPDATE
SET clerk_id = EXCLUDED.clerk_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    event_name = EXCLUDED.event_name,
    updated_at = NOW();

DELETE FROM public.invites i
USING public.members m
WHERE LOWER(i.email) = LOWER(m.email);

SELECT email, name, role FROM public.members ORDER BY created_at DESC;

-- If a person already created an account before the Core Team sends their
-- invite, activate them immediately when the invite is added.
CREATE OR REPLACE FUNCTION public.add_invite(
  p_email TEXT,
  p_name TEXT,
  p_role public.member_role,
  p_event_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_member public.members%ROWTYPE;
  invite_record public.invites%ROWTYPE;
  account_record auth.users%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM public.members WHERE clerk_id = auth.uid()::TEXT;
  IF NOT FOUND OR caller_member.role != 'core' THEN
    RAISE EXCEPTION 'Only Core Team members can invite people';
  END IF;

  INSERT INTO public.invites (email, name, role, event_name)
  VALUES (LOWER(p_email), p_name, p_role, p_event_name)
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    event_name = EXCLUDED.event_name
  RETURNING * INTO invite_record;

  SELECT * INTO account_record FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF FOUND THEN
    INSERT INTO public.members (clerk_id, email, name, role, event_name)
    VALUES (account_record.id::TEXT, LOWER(account_record.email), invite_record.name, invite_record.role, invite_record.event_name)
    ON CONFLICT (email) DO UPDATE SET
      clerk_id = EXCLUDED.clerk_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      event_name = EXCLUDED.event_name,
      updated_at = NOW();
    DELETE FROM public.invites WHERE id = invite_record.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_invite(TEXT, TEXT, public.member_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_invite(TEXT, TEXT, public.member_role, TEXT) TO authenticated;

-- Keep the sign-in fallback compatible with RETURNS SETOF members.  A composite
-- row variable must be emitted with RETURN NEXT; SELECTing that variable yields
-- one composite column and causes a result-shape error in Postgres.
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

  SELECT LOWER(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  IF current_email IS NULL THEN
    RAISE EXCEPTION 'The signed-in account has no email address';
  END IF;

  SELECT * INTO existing_member FROM public.members WHERE clerk_id = current_user_id;
  IF FOUND THEN
    RETURN NEXT existing_member;
    RETURN;
  END IF;

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
