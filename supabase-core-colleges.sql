-- Apply after the collaboration workspace SQL. Existing members/posts are NHCE.
BEGIN;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS core_college TEXT NOT NULL DEFAULT 'nhce' CHECK (core_college IN ('nhce','nhcm','nhck'));
ALTER TABLE public.shared_updates ADD COLUMN IF NOT EXISTS core_college TEXT NOT NULL DEFAULT 'nhce' CHECK (core_college IN ('nhce','nhcm','nhck'));
-- Membership changes must use the checked RPC; block direct privilege changes.
REVOKE UPDATE ON public.members FROM authenticated, anon;
REVOKE ALL ON public.shared_updates FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_core_college(p_member_id UUID, p_college TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' OR caller.core_college <> 'nhce' THEN
    RAISE EXCEPTION 'Only NHCE Core can change Core colleges';
  END IF;
  IF p_college IS NULL OR p_college NOT IN ('nhce','nhcm','nhck') THEN RAISE EXCEPTION 'Invalid college'; END IF;
  -- Serialize switches so concurrent requests cannot remove the last NHCE Core.
  PERFORM pg_advisory_xact_lock(20260905);
  IF p_college <> 'nhce' AND EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id AND role = 'core' AND core_college = 'nhce')
    AND (SELECT count(*) FROM public.members WHERE role = 'core' AND core_college = 'nhce') <= 1 THEN
    RAISE EXCEPTION 'Keep at least one NHCE Core member to manage the team';
  END IF;
  UPDATE public.members SET core_college = p_college WHERE id = p_member_id AND role = 'core';
  IF NOT FOUND THEN RAISE EXCEPTION 'Core member not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_shared_updates()
RETURNS TABLE(id UUID, content TEXT, created_at TIMESTAMPTZ, author_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' THEN RAISE EXCEPTION 'Core access required'; END IF;
  RETURN QUERY SELECT u.id, u.content, u.created_at, m.name
    FROM public.shared_updates u JOIN public.members m ON m.id = u.author_id
    WHERE caller.core_college = 'nhce' OR u.core_college = caller.core_college
    ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_college_updates(p_college TEXT)
RETURNS TABLE(id UUID, content TEXT, created_at TIMESTAMPTZ, author_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' OR (caller.core_college <> 'nhce' AND caller.core_college <> p_college) THEN RAISE EXCEPTION 'This Core board is private'; END IF;
  RETURN QUERY SELECT u.id, u.content, u.created_at, m.name
    FROM public.shared_updates u JOIN public.members m ON m.id = u.author_id
    WHERE u.core_college = p_college ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_shared_update(p_content TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE caller public.members%ROWTYPE; result UUID;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' THEN RAISE EXCEPTION 'Core access required'; END IF;
  INSERT INTO public.shared_updates(author_id,content,core_college)
    VALUES(caller.id,btrim(p_content),caller.core_college) RETURNING id INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_core_college(UUID,TEXT), public.list_college_updates(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_core_college(UUID,TEXT), public.list_college_updates(TEXT) TO authenticated;
COMMIT;
