-- Run in Supabase SQL Editor after supabase-collaboration-workspace.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.team_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_updates FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_team_updates()
RETURNS TABLE(id UUID, content TEXT, created_at TIMESTAMPTZ, author_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  PERFORM public.workspace_member();
  RETURN QUERY SELECT u.id, u.content, u.created_at, m.name
    FROM public.team_updates u JOIN public.members m ON m.id = u.author_id
    ORDER BY u.created_at DESC, u.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_team_update(p_content TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; new_id UUID;
BEGIN
  caller := public.workspace_member();
  INSERT INTO public.team_updates(author_id, content)
    VALUES (caller.id, btrim(p_content)) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_team_updates(), public.add_team_update(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_updates(), public.add_team_update(TEXT) TO authenticated;
COMMIT;
