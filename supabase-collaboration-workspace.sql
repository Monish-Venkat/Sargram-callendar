-- Run once in the Supabase SQL Editor after the main SARGAM schema.
-- Collaboration workspace: shared core updates, private notes, assignments,
-- media links, and Core-to-Event-Head notifications.

CREATE TABLE IF NOT EXISTS public.shared_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.private_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id)
);

CREATE TABLE IF NOT EXISTS public.assigned_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  assignee_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  media_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS media_link TEXT;

CREATE INDEX IF NOT EXISTS idx_assigned_tasks_assignee ON public.assigned_tasks(assignee_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, read_at, created_at DESC);

ALTER TABLE public.shared_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assigned_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_member()
RETURNS public.members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result public.members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO result FROM public.members WHERE clerk_id = auth.uid()::TEXT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member access is not configured'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_shared_updates()
RETURNS TABLE(id UUID, content TEXT, created_at TIMESTAMPTZ, author_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' THEN RAISE EXCEPTION 'Only Core Team members can view shared updates'; END IF;
  RETURN QUERY SELECT u.id, u.content, u.created_at, m.name
  FROM public.shared_updates u JOIN public.members m ON m.id = u.author_id
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_shared_update(p_content TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; new_id UUID;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' THEN RAISE EXCEPTION 'Only Core Team members can post shared updates'; END IF;
  INSERT INTO public.shared_updates(author_id, content) VALUES (caller.id, trim(p_content)) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_private_note()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; result TEXT;
BEGIN
  caller := public.workspace_member();
  SELECT content INTO result FROM public.private_notes WHERE owner_id = caller.id;
  RETURN COALESCE(result, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_private_note(p_content TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  INSERT INTO public.private_notes(owner_id, content) VALUES (caller.id, COALESCE(p_content, ''))
  ON CONFLICT (owner_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_assignable_members()
RETURNS TABLE(id UUID, name TEXT, role public.member_role, event_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role = 'core' THEN
    RETURN QUERY SELECT m.id, m.name, m.role, m.event_name FROM public.members m WHERE m.role IN ('core', 'event_head') ORDER BY m.role, m.name;
  ELSIF caller.role = 'teacher' THEN
    RETURN QUERY SELECT m.id, m.name, m.role, m.event_name FROM public.members m WHERE m.role = 'core' ORDER BY m.name;
  ELSE
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_assignment(p_title TEXT, p_description TEXT, p_assignee_id UUID, p_due_date DATE DEFAULT NULL, p_media_link TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; assignee public.members%ROWTYPE; new_id UUID;
BEGIN
  caller := public.workspace_member();
  SELECT * INTO assignee FROM public.members WHERE id = p_assignee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignee not found'; END IF;
  IF caller.role = 'core' AND assignee.role IN ('core', 'event_head') THEN NULL;
  ELSIF caller.role = 'teacher' AND assignee.role = 'core' THEN NULL;
  ELSE RAISE EXCEPTION 'You cannot assign a task to this member'; END IF;
  INSERT INTO public.assigned_tasks(title, description, assignee_id, assigned_by, due_date, media_link)
  VALUES (trim(p_title), COALESCE(trim(p_description), ''), assignee.id, caller.id, p_due_date, NULLIF(trim(p_media_link), '')) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_assignments()
RETURNS TABLE(id UUID, title TEXT, description TEXT, due_date DATE, status TEXT, media_link TEXT, created_at TIMESTAMPTZ, assignee_id UUID, assignee_name TEXT, assignee_role public.member_role, assigned_by_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  RETURN QUERY
  SELECT t.id, t.title, t.description, t.due_date, t.status, t.media_link, t.created_at, t.assignee_id, a.name, a.role, b.name
  FROM public.assigned_tasks t JOIN public.members a ON a.id = t.assignee_id JOIN public.members b ON b.id = t.assigned_by
  WHERE caller.role = 'core'
     OR t.assignee_id = caller.id
     OR (caller.role = 'teacher' AND a.role = 'core')
  ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END, t.due_date NULLS LAST, t.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_assignment_status(p_task_id UUID, p_status TEXT, p_media_link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; target public.assigned_tasks%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  SELECT * INTO target FROM public.assigned_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF target.assignee_id <> caller.id THEN RAISE EXCEPTION 'Only the assigned member can update this task'; END IF;
  IF p_status NOT IN ('todo', 'in_progress', 'done') THEN RAISE EXCEPTION 'Invalid task status'; END IF;
  UPDATE public.assigned_tasks SET status = p_status, media_link = COALESCE(NULLIF(trim(p_media_link), ''), media_link), updated_at = NOW() WHERE id = target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_notifications()
RETURNS TABLE(id UUID, content TEXT, created_at TIMESTAMPTZ, sender_name TEXT, read_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  RETURN QUERY SELECT n.id, n.content, n.created_at, m.name, n.read_at FROM public.notifications n JOIN public.members m ON m.id = n.sender_id WHERE n.recipient_id = caller.id ORDER BY n.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_event_head_notice(p_recipient_id UUID, p_content TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; recipient public.members%ROWTYPE; new_id UUID;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' THEN RAISE EXCEPTION 'Only Core Team members can send Event Head notices'; END IF;
  SELECT * INTO recipient FROM public.members WHERE id = p_recipient_id;
  IF NOT FOUND OR recipient.role <> 'event_head' THEN RAISE EXCEPTION 'Not an Event Head'; END IF;
  INSERT INTO public.notifications(recipient_id, sender_id, content) VALUES (recipient.id, caller.id, trim(p_content)) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  UPDATE public.notifications SET read_at = NOW() WHERE recipient_id = caller.id AND read_at IS NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_task_log(DATE, TEXT);
CREATE FUNCTION public.upsert_task_log(p_date DATE, p_description TEXT, p_media_link TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; log_id UUID;
BEGIN
  caller := public.workspace_member();
  IF caller.role = 'teacher' THEN RAISE EXCEPTION 'Teacher accounts are read-only for daily updates'; END IF;
  INSERT INTO public.task_logs(member_id, date, description, media_link, updated_at)
  VALUES (caller.id, p_date, COALESCE(trim(p_description), ''), NULLIF(trim(p_media_link), ''), NOW())
  ON CONFLICT (member_id, date) DO UPDATE SET description = EXCLUDED.description, media_link = EXCLUDED.media_link, updated_at = NOW()
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_shared_updates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_shared_update(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_private_note() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_private_note(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assignable_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_assignment(TEXT, TEXT, UUID, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_assignment_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_event_head_notice(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notifications_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_task_log(DATE, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_shared_updates(), public.add_shared_update(TEXT), public.get_private_note(), public.save_private_note(TEXT), public.list_assignable_members(), public.create_assignment(TEXT, TEXT, UUID, DATE, TEXT), public.list_assignments(), public.update_assignment_status(UUID, TEXT, TEXT), public.list_notifications(), public.send_event_head_notice(UUID, TEXT), public.mark_notifications_read(), public.upsert_task_log(DATE, TEXT, TEXT) TO authenticated;
