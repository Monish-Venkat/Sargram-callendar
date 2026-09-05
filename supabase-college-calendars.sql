-- Run after supabase-core-colleges.sql. Personal logs remain unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.college_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college TEXT NOT NULL CHECK (college IN ('nhce','nhcm','nhck')),
  date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  media_link TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(college,date)
);
ALTER TABLE public.college_calendar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.college_calendar FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_college_calendar(p_college TEXT)
RETURNS SETOF public.college_calendar LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' OR (caller.core_college <> 'nhce' AND caller.core_college <> p_college) THEN RAISE EXCEPTION 'Calendar access denied'; END IF;
  RETURN QUERY SELECT * FROM public.college_calendar WHERE college=p_college ORDER BY date;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_college_calendar(p_college TEXT,p_date DATE,p_description TEXT,p_media_link TEXT,p_version TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE caller public.members%ROWTYPE; entry public.college_calendar%ROWTYPE;
BEGIN
  caller := public.workspace_member();
  IF caller.role <> 'core' OR caller.core_college <> p_college THEN RAISE EXCEPTION 'You can edit only your own college calendar'; END IF;
  IF p_date > DATE '2026-10-31' THEN RAISE EXCEPTION 'Calendar entries are available through October 31'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_college || p_date::TEXT));
  SELECT * INTO entry FROM public.college_calendar WHERE college=p_college AND date=p_date;
  IF entry.updated_at IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Another Core member changed this day. Close and reopen it before saving.'; END IF;
  IF btrim(coalesce(p_description,''))='' AND btrim(coalesce(p_media_link,''))='' THEN
    DELETE FROM public.college_calendar WHERE college=p_college AND date=p_date;
  ELSE
    INSERT INTO public.college_calendar(college,date,description,media_link) VALUES(p_college,p_date,p_description,nullif(p_media_link,''))
    ON CONFLICT(college,date) DO UPDATE SET description=EXCLUDED.description,media_link=EXCLUDED.media_link,updated_at=clock_timestamp();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_college_calendar(TEXT),public.save_college_calendar(TEXT,DATE,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_college_calendar(TEXT),public.save_college_calendar(TEXT,DATE,TEXT,TEXT,TIMESTAMPTZ) TO authenticated;
COMMIT;
