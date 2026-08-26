import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions matching the database schema
export type MemberRole = 'event_head' | 'core' | 'teacher';

export interface Member {
  id: string;
  clerk_id: string;
  email: string;
  name: string;
  role: MemberRole;
  event_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  event_name: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  name: string;
  created_at: string;
}

export interface TaskLog {
  id: string;
  member_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  updated_at: string;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// Extended types with joined member data
export interface TaskLogWithMember extends TaskLog {
  member_name: string;
  member_role: MemberRole;
  member_event_name: string | null;
}

// RPC function return types
export interface PendingReviewLog extends TaskLogWithMember {}

export interface AllReviewLog extends TaskLogWithMember {}

// Auth helper
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
