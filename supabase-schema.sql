-- Supabase Schema for SARGAM Task Tracker
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE member_role AS ENUM ('event_head', 'core', 'teacher');

-- Members table (registered users)
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role member_role NOT NULL,
  event_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Clerk ID lookups
CREATE INDEX idx_members_clerk_id ON members(clerk_id);
CREATE INDEX idx_members_email ON members(email);

-- Invites table (pre-seeded allowlist)
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role member_role NOT NULL,
  event_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invites_email ON invites(email);

-- Events/Departments table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_name ON events(name);

-- Task Logs table
CREATE TABLE task_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  UNIQUE(member_id, date)
);

CREATE INDEX idx_task_logs_member ON task_logs(member_id);
CREATE INDEX idx_task_logs_member_date ON task_logs(member_id, date);
CREATE INDEX idx_task_logs_reviewed ON task_logs(reviewed);

-- Row Level Security (RLS) Policies
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;

-- Members policies
CREATE POLICY "Users can view their own member record" ON members
  FOR SELECT USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY "Core team can view all members" ON members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role IN ('core', 'teacher')
    )
  );

CREATE POLICY "Core team can insert members" ON members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role = 'core'
    )
  );

CREATE POLICY "Core team can update members" ON members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role = 'core'
    )
  );

-- Invites policies
CREATE POLICY "Core team can manage invites" ON invites
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role = 'core'
    )
  );

-- Events policies
CREATE POLICY "Authenticated users can view events" ON events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "Core team can manage events" ON events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role = 'core'
    )
  );

-- Task Logs policies
CREATE POLICY "Users can view their own logs" ON task_logs
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "Core/Teacher can view all logs" ON task_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role IN ('core', 'teacher')
    )
  );

CREATE POLICY "Event heads can insert/update own logs" ON task_logs
  FOR INSERT WITH CHECK (
    member_id IN (
      SELECT id FROM members WHERE clerk_id = auth.jwt() ->> 'sub'
      AND role != 'teacher'
    )
  );

CREATE POLICY "Event heads can update own logs" ON task_logs
  FOR UPDATE USING (
    member_id IN (
      SELECT id FROM members WHERE clerk_id = auth.jwt() ->> 'sub'
      AND role != 'teacher'
    )
  );

CREATE POLICY "Core/Teacher can review logs" ON task_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.clerk_id = auth.jwt() ->> 'sub' 
      AND m.role IN ('core', 'teacher')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_logs_updated_at BEFORE UPDATE ON task_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper function: Get current member from the authenticated Supabase user
CREATE OR REPLACE FUNCTION get_current_member()
RETURNS SETOF members AS $$
BEGIN
  RETURN QUERY SELECT * FROM members WHERE clerk_id = auth.jwt() ->> 'sub';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Ensure member exists (called on first sign in)
CREATE OR REPLACE FUNCTION ensure_member()
RETURNS SETOF members AS $$
DECLARE
  current_user_id TEXT := auth.uid()::TEXT;
  current_email TEXT;
  existing_member members%ROWTYPE;
  invite_record invites%ROWTYPE;
  new_member members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT LOWER(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  IF current_email IS NULL THEN
    RAISE EXCEPTION 'The signed-in account has no email address';
  END IF;

  SELECT * INTO existing_member FROM members WHERE clerk_id = current_user_id;
  IF FOUND THEN
    RETURN QUERY SELECT existing_member;
    RETURN;
  END IF;

  -- A verified email match can safely attach a legacy record.
  SELECT * INTO existing_member FROM members WHERE LOWER(email) = current_email;
  IF FOUND THEN
    UPDATE members SET clerk_id = current_user_id WHERE id = existing_member.id
    RETURNING * INTO new_member;
    RETURN QUERY SELECT new_member;
    RETURN;
  END IF;

  SELECT * INTO invite_record FROM invites WHERE email = current_email;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO members (clerk_id, email, name, role, event_name)
  VALUES (current_user_id, current_email, invite_record.name, invite_record.role, invite_record.event_name)
  RETURNING * INTO new_member;

  -- Delete the invite
  DELETE FROM invites WHERE id = invite_record.id;

  RETURN QUERY SELECT new_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE ALL ON FUNCTION ensure_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_member() TO authenticated;

-- Helper function: Get viewable members for current user
CREATE OR REPLACE FUNCTION get_viewable_members()
RETURNS SETOF members AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF caller_member.role = 'event_head' THEN
    RETURN QUERY SELECT caller_member;
  ELSE
    RETURN QUERY SELECT * FROM members WHERE role != 'teacher';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get pending review logs
CREATE OR REPLACE FUNCTION get_pending_review_logs()
RETURNS TABLE (
  id UUID,
  member_id UUID,
  date DATE,
  description TEXT,
  updated_at TIMESTAMPTZ,
  reviewed BOOLEAN,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  member_name TEXT,
  member_role member_role,
  member_event_name TEXT
) AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role NOT IN ('core', 'teacher') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT tl.id, tl.member_id, tl.date, tl.description, tl.updated_at, tl.reviewed, tl.reviewed_by, tl.reviewed_at,
         m.name as member_name, m.role as member_role, m.event_name as member_event_name
  FROM task_logs tl
  JOIN members m ON tl.member_id = m.id
  WHERE tl.reviewed = FALSE
  ORDER BY tl.date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get all logs for review (with optional member filter)
CREATE OR REPLACE FUNCTION get_all_logs_for_review(p_member_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  member_id UUID,
  date DATE,
  description TEXT,
  updated_at TIMESTAMPTZ,
  reviewed BOOLEAN,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  member_name TEXT,
  member_role member_role,
  member_event_name TEXT
) AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role NOT IN ('core', 'teacher') THEN
    RETURN;
  END IF;

  IF p_member_id IS NOT NULL THEN
    RETURN QUERY
    SELECT tl.id, tl.member_id, tl.date, tl.description, tl.updated_at, tl.reviewed, tl.reviewed_by, tl.reviewed_at,
           m.name as member_name, m.role as member_role, m.event_name as member_event_name
    FROM task_logs tl
    JOIN members m ON tl.member_id = m.id
    WHERE tl.member_id = p_member_id
    ORDER BY tl.date DESC;
  ELSE
    RETURN QUERY
    SELECT tl.id, tl.member_id, tl.date, tl.description, tl.updated_at, tl.reviewed, tl.reviewed_by, tl.reviewed_at,
           m.name as member_name, m.role as member_role, m.event_name as member_event_name
    FROM task_logs tl
    JOIN members m ON tl.member_id = m.id
    ORDER BY tl.date DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get logs for a specific member
CREATE OR REPLACE FUNCTION get_logs_for_member(p_member_id UUID)
RETURNS SETOF task_logs AS $$
DECLARE
  caller_member members%ROWTYPE;
  target_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO target_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check authorization
  IF caller_member.id != p_member_id AND caller_member.role NOT IN ('core', 'teacher') THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM task_logs WHERE member_id = p_member_id ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Upsert task log
CREATE OR REPLACE FUNCTION upsert_task_log(p_date DATE, p_description TEXT)
RETURNS UUID AS $$
DECLARE
  caller_member members%ROWTYPE;
  log_id UUID;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role = 'teacher' THEN
    RAISE EXCEPTION 'Not authorized or read-only account';
  END IF;

  INSERT INTO task_logs (member_id, date, description, updated_at)
  VALUES (caller_member.id, p_date, p_description, NOW())
  ON CONFLICT (member_id, date) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = NOW()
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Delete task log
CREATE OR REPLACE FUNCTION delete_task_log(p_date DATE)
RETURNS VOID AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM task_logs WHERE member_id = caller_member.id AND date = p_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Review a log
CREATE OR REPLACE FUNCTION review_task_log(p_log_id UUID, p_reviewed BOOLEAN)
RETURNS UUID AS $$
DECLARE
  caller_member members%ROWTYPE;
  log_record task_logs%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role NOT IN ('core', 'teacher') THEN
    RAISE EXCEPTION 'Only core team and teachers can review logs';
  END IF;

  SELECT * INTO log_record FROM task_logs WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found';
  END IF;

  UPDATE task_logs SET
    reviewed = p_reviewed,
    reviewed_by = CASE WHEN p_reviewed THEN caller_member.id ELSE NULL END,
    reviewed_at = CASE WHEN p_reviewed THEN NOW() ELSE NULL END
  WHERE id = p_log_id;

  RETURN p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Bulk review logs
CREATE OR REPLACE FUNCTION bulk_review_task_logs(p_log_ids UUID[], p_reviewed BOOLEAN)
RETURNS INTEGER AS $$
DECLARE
  caller_member members%ROWTYPE;
  count INTEGER := 0;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role NOT IN ('core', 'teacher') THEN
    RAISE EXCEPTION 'Only core team and teachers can review logs';
  END IF;

  UPDATE task_logs SET
    reviewed = p_reviewed,
    reviewed_by = CASE WHEN p_reviewed THEN caller_member.id ELSE NULL END,
    reviewed_at = CASE WHEN p_reviewed THEN NOW() ELSE NULL END
  WHERE id = ANY(p_log_ids);

  GET DIAGNOSTICS count = ROW_COUNT;
  RETURN count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin functions (core team only)
CREATE OR REPLACE FUNCTION add_invite(p_email TEXT, p_name TEXT, p_role member_role, p_event_name TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  caller_member members%ROWTYPE;
  any_members BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM members) INTO any_members;
  
  IF any_members THEN
    SELECT * INTO caller_member FROM get_current_member();
    IF NOT FOUND OR caller_member.role != 'core' THEN
      RAISE EXCEPTION 'Only core team members can add people to the invite list';
    END IF;
  END IF;

  INSERT INTO invites (email, name, role, event_name)
  VALUES (LOWER(p_email), p_name, p_role, p_event_name)
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    event_name = EXCLUDED.event_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_invite(p_invite_id UUID)
RETURNS VOID AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role != 'core' THEN
    RAISE EXCEPTION 'Only core team members can remove invites';
  END IF;
  DELETE FROM invites WHERE id = p_invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_invites()
RETURNS SETOF invites AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role != 'core' THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM invites ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_all_members()
RETURNS SETOF members AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role != 'core' THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM members ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_event(p_name TEXT)
RETURNS UUID AS $$
DECLARE
  caller_member members%ROWTYPE;
  event_id UUID;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND OR caller_member.role != 'core' THEN
    RAISE EXCEPTION 'Only core team members can add events/departments';
  END IF;

  INSERT INTO events (name) VALUES (TRIM(p_name))
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO event_id;

  IF event_id IS NULL THEN
    SELECT id INTO event_id FROM events WHERE name = TRIM(p_name);
  END IF;

  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_events()
RETURNS SETOF events AS $$
DECLARE
  caller_member members%ROWTYPE;
BEGIN
  SELECT * INTO caller_member FROM get_current_member();
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM events ORDER BY name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
