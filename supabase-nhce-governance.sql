-- Run after the Core-college and shared-calendar migrations.
BEGIN;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS core_college TEXT CHECK (core_college IN ('nhce','nhcm','nhck'));
UPDATE public.invites SET core_college = 'nhce' WHERE role = 'core' AND core_college IS NULL;

CREATE OR REPLACE FUNCTION public.provision_invited_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite_record public.invites%ROWTYPE;
BEGIN
  SELECT * INTO invite_record FROM public.invites WHERE LOWER(email) = LOWER(NEW.email);
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.members (clerk_id,email,name,role,event_name,core_college)
  VALUES (NEW.id::TEXT,LOWER(NEW.email),invite_record.name,invite_record.role,invite_record.event_name,COALESCE(invite_record.core_college,'nhce'))
  ON CONFLICT (email) DO UPDATE SET clerk_id=EXCLUDED.clerk_id,name=EXCLUDED.name,role=EXCLUDED.role,event_name=EXCLUDED.event_name,core_college=EXCLUDED.core_college,updated_at=NOW();
  DELETE FROM public.invites WHERE id=invite_record.id;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.add_invite(TEXT,TEXT,public.member_role,TEXT);
CREATE FUNCTION public.add_invite(p_email TEXT,p_name TEXT,p_role public.member_role,p_event_name TEXT DEFAULT NULL,p_core_college TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,auth AS $$
DECLARE caller public.members%ROWTYPE; account auth.users%ROWTYPE; invite public.invites%ROWTYPE; target_college TEXT;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' OR caller.core_college <> 'nhce' THEN RAISE EXCEPTION 'Only NHCE Core can manage members'; END IF;
  target_college := CASE WHEN p_role='core' THEN COALESCE(p_core_college,'nhce') ELSE NULL END;
  IF target_college IS NOT NULL AND target_college NOT IN ('nhce','nhcm','nhck') THEN RAISE EXCEPTION 'Invalid Core college'; END IF;
  INSERT INTO public.invites(email,name,role,event_name,core_college) VALUES(LOWER(TRIM(p_email)),TRIM(p_name),p_role,NULLIF(TRIM(p_event_name),''),target_college)
  ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,event_name=EXCLUDED.event_name,core_college=EXCLUDED.core_college RETURNING * INTO invite;
  SELECT * INTO account FROM auth.users WHERE LOWER(email)=LOWER(TRIM(p_email));
  IF FOUND THEN
    INSERT INTO public.members(clerk_id,email,name,role,event_name,core_college) VALUES(account.id::TEXT,LOWER(account.email),invite.name,invite.role,invite.event_name,COALESCE(invite.core_college,'nhce'))
    ON CONFLICT(email) DO UPDATE SET clerk_id=EXCLUDED.clerk_id,name=EXCLUDED.name,role=EXCLUDED.role,event_name=EXCLUDED.event_name,core_college=EXCLUDED.core_college,updated_at=NOW();
    DELETE FROM public.invites WHERE id=invite.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invite(p_invite_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE; BEGIN caller:=public.workspace_member(); IF caller.role<>'core' OR caller.core_college<>'nhce' THEN RAISE EXCEPTION 'Only NHCE Core can manage members'; END IF; DELETE FROM public.invites WHERE id=p_invite_id; END; $$;
CREATE OR REPLACE FUNCTION public.list_invites() RETURNS SETOF public.invites LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE; BEGIN caller:=public.workspace_member(); IF caller.role<>'core' OR caller.core_college<>'nhce' THEN RETURN; END IF; RETURN QUERY SELECT * FROM public.invites ORDER BY created_at DESC; END; $$;
CREATE OR REPLACE FUNCTION public.list_all_members() RETURNS SETOF public.members LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE; BEGIN caller:=public.workspace_member(); IF caller.role<>'core' OR caller.core_college<>'nhce' THEN RETURN; END IF; RETURN QUERY SELECT * FROM public.members ORDER BY created_at DESC; END; $$;
CREATE OR REPLACE FUNCTION public.add_event(p_name TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE; result UUID; BEGIN caller:=public.workspace_member(); IF caller.role<>'core' OR caller.core_college<>'nhce' THEN RAISE EXCEPTION 'Only NHCE Core can manage events'; END IF; INSERT INTO public.events(name) VALUES(TRIM(p_name)) RETURNING id INTO result; RETURN result; END; $$;

CREATE OR REPLACE FUNCTION public.get_college_calendar(p_college TEXT)
RETURNS SETOF public.college_calendar LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller:=public.workspace_member();
  IF caller.role='event_head' THEN NULL;
  ELSIF caller.role='core' AND (caller.core_college='nhce' OR caller.core_college=p_college) THEN NULL;
  ELSE RAISE EXCEPTION 'Calendar access denied'; END IF;
  RETURN QUERY SELECT * FROM public.college_calendar WHERE college=p_college ORDER BY date;
END;
$$;

REVOKE ALL ON FUNCTION public.add_invite(TEXT,TEXT,public.member_role,TEXT,TEXT),public.delete_invite(UUID),public.list_invites(),public.list_all_members(),public.add_event(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_invite(TEXT,TEXT,public.member_role,TEXT,TEXT),public.delete_invite(UUID),public.list_invites(),public.list_all_members(),public.add_event(TEXT) TO authenticated;
COMMIT;
