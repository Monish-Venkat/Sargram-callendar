-- Run after supabase-collaboration-workspace.sql and supabase-nhce-governance.sql.
-- Reuses the existing private notifications table for Core ↔ Event Head messages.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_message_recipients()
RETURNS TABLE(id UUID, name TEXT, role public.member_role, event_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role = 'core' THEN
    RETURN QUERY SELECT m.id, m.name, m.role, m.event_name
      FROM public.members m WHERE m.role = 'event_head' ORDER BY m.name;
  ELSIF caller.role = 'event_head' THEN
    RETURN QUERY SELECT m.id, m.name, m.role, m.event_name
      FROM public.members m WHERE m.role = 'core' ORDER BY m.name;
  ELSE
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_direct_message(p_recipient_id UUID, p_content TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; recipient public.members%ROWTYPE; new_id UUID;
BEGIN
  caller := public.workspace_member();
  IF caller.role NOT IN ('core', 'event_head') THEN
    RAISE EXCEPTION 'Only Core members and Event Heads can send direct messages';
  END IF;
  SELECT * INTO recipient FROM public.members WHERE id = p_recipient_id;
  IF NOT FOUND OR recipient.role NOT IN ('core', 'event_head') OR recipient.role = caller.role THEN
    RAISE EXCEPTION 'Choose a member in the other role';
  END IF;
  IF NULLIF(trim(p_content), '') IS NULL THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  INSERT INTO public.notifications(recipient_id, sender_id, content)
    VALUES (recipient.id, caller.id, trim(p_content)) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_message_recipients(), public.send_direct_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_message_recipients(), public.send_direct_message(UUID, TEXT) TO authenticated;
COMMIT;
