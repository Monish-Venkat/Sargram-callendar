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
