import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Member, TaskLogWithMember, TaskLog, Event, Invite, MemberRole, Assignment, SharedUpdate, Notice } from '../lib/supabase';

// Query keys
export const queryKeys = {
  currentMember: ['currentMember'] as const,
  viewableMembers: ['viewableMembers'] as const,
  invites: ['invites'] as const,
  allMembers: ['allMembers'] as const,
  events: ['events'] as const,
  logsForMember: (memberId: string) => ['logsForMember', memberId] as const,
  pendingReviewLogs: ['pendingReviewLogs'] as const,
  allLogsForReview: (memberId?: string) => ['allLogsForReview', memberId] as const,
  assignments: ['assignments'] as const,
  assignableMembers: ['assignableMembers'] as const,
  sharedUpdates: ['sharedUpdates'] as const,
  privateNote: ['privateNote'] as const,
  notices: ['notices'] as const,
};

// Current member
export function useCurrentMember() {
  return useQuery({
    queryKey: queryKeys.currentMember,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_member');
      if (error) throw error;
      return data?.[0] as Member | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Ensure member (call on sign in)
export function useEnsureMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ensure_member');
      if (error) throw error;
      return data?.[0] as Member | null;
    },
    onSuccess: (member) => {
      queryClient.setQueryData(queryKeys.currentMember, member);
    },
  });
}

// Viewable members
export function useViewableMembers() {
  return useQuery({
    queryKey: queryKeys.viewableMembers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_viewable_members');
      if (error) throw error;
      return data as Member[];
    },
  });
}

// Invites (core only)
export function useInvites() {
  return useQuery({
    queryKey: queryKeys.invites,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_invites');
      if (error) throw error;
      return data as Invite[];
    },
  });
}

export function useAddInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { email: string; name: string; role: MemberRole; eventName?: string }) => {
      const { error } = await supabase.rpc('add_invite', {
        p_email: args.email,
        p_name: args.name,
        p_role: args.role,
        p_event_name: args.eventName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invites });
      queryClient.invalidateQueries({ queryKey: queryKeys.allMembers });
      queryClient.invalidateQueries({ queryKey: queryKeys.viewableMembers });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('delete_invite', { p_invite_id: inviteId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invites });
    },
  });
}

// All members (core only)
export function useAllMembers() {
  return useQuery({
    queryKey: queryKeys.allMembers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_all_members');
      if (error) throw error;
      return data as Member[];
    },
  });
}

// Events
export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_events');
      if (error) throw error;
      return data as Event[];
    },
  });
}

export function useAddEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('add_event', { p_name: name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}

// Task logs for a member
export function useLogsForMember(memberId: string | undefined) {
  return useQuery({
    queryKey: memberId ? queryKeys.logsForMember(memberId) : ['logsForMember', 'none'],
    queryFn: async () => {
      if (!memberId) return [];
      const { data, error } = await supabase.rpc('get_logs_for_member', { p_member_id: memberId });
      if (error) throw error;
      return data as TaskLog[];
    },
    enabled: !!memberId,
  });
}

export function useUpsertLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { date: string; description: string; mediaLink?: string }) => {
      const { data, error } = await supabase.rpc('upsert_task_log', {
        p_date: args.date,
        p_description: args.description,
        p_media_link: args.mediaLink || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, variables) => {
      // Invalidate logs for the current member
      queryClient.invalidateQueries({ queryKey: ['logsForMember'] });
    },
  });
}

export function useDeleteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.rpc('delete_task_log', { p_date: date });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logsForMember'] });
    },
  });
}

// Review functions
export function usePendingReviewLogs() {
  return useQuery({
    queryKey: queryKeys.pendingReviewLogs,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_review_logs');
      if (error) throw error;
      return data as TaskLogWithMember[];
    },
  });
}

export function useAllLogsForReview(memberId?: string) {
  return useQuery({
    queryKey: queryKeys.allLogsForReview(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_logs_for_review', {
        p_member_id: memberId ?? null,
      });
      if (error) throw error;
      return data as TaskLogWithMember[];
    },
  });
}

export function useReviewLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { logId: string; reviewed: boolean }) => {
      const { data, error } = await supabase.rpc('review_task_log', {
        p_log_id: args.logId,
        p_reviewed: args.reviewed,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingReviewLogs });
      queryClient.invalidateQueries({ queryKey: queryKeys.allLogsForReview() });
      queryClient.invalidateQueries({ queryKey: ['logsForMember'] });
    },
  });
}

export function useBulkReviewLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { logIds: string[]; reviewed: boolean }) => {
      const { data, error } = await supabase.rpc('bulk_review_task_logs', {
        p_log_ids: args.logIds,
        p_reviewed: args.reviewed,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingReviewLogs });
      queryClient.invalidateQueries({ queryKey: queryKeys.allLogsForReview() });
      queryClient.invalidateQueries({ queryKey: ['logsForMember'] });
    },
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: queryKeys.assignments,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_assignments');
      if (error) throw error;
      return data as Assignment[];
    },
  });
}

export function useAssignableMembers() {
  return useQuery({
    queryKey: queryKeys.assignableMembers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_assignable_members');
      if (error) throw error;
      return data as Pick<Member, 'id' | 'name' | 'role' | 'event_name'>[];
    },
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { title: string; description: string; assigneeId: string; dueDate?: string; mediaLink?: string }) => {
      const { error } = await supabase.rpc('create_assignment', {
        p_title: args.title,
        p_description: args.description,
        p_assignee_id: args.assigneeId,
        p_due_date: args.dueDate || null,
        p_media_link: args.mediaLink || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { taskId: string; status: string; mediaLink?: string }) => {
      const { error } = await supabase.rpc('update_assignment_status', { p_task_id: args.taskId, p_status: args.status, p_media_link: args.mediaLink || null });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
  });
}

export function useTeamUpdates() {
  return useQuery({
    queryKey: ['teamUpdates'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_team_updates');
      if (error) throw error;
      return data as SharedUpdate[];
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useAddTeamUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.rpc('add_team_update', { p_content: content });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['teamUpdates'] }),
  });
}

export function useSetCoreCollege() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, college }: { memberId: string; college: string }) => {
      const { error } = await supabase.rpc('set_core_college', { p_member_id: memberId, p_college: college });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useSharedUpdates(enabled = true, college = 'nhce') {
  return useQuery({
    queryKey: [...queryKeys.sharedUpdates, college],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_college_updates', { p_college: college });
      if (error) throw error;
      return data as SharedUpdate[];
    },
    enabled,
  });
}

export function useAddSharedUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.rpc('add_shared_update', { p_content: content });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sharedUpdates }),
  });
}

export function usePrivateNote() {
  return useQuery({
    queryKey: queryKeys.privateNote,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_private_note');
      if (error) throw error;
      return data as string;
    },
  });
}

export function useSavePrivateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.rpc('save_private_note', { p_content: content });
      if (error) throw error;
    },
    onSuccess: (_data, content) => queryClient.setQueryData(queryKeys.privateNote, content),
  });
}

export function useNotices() {
  return useQuery({
    queryKey: queryKeys.notices,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_notifications');
      if (error) throw error;
      return data as Notice[];
    },
  });
}

export function useSendNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { recipientId: string; content: string }) => {
      const { error } = await supabase.rpc('send_event_head_notice', { p_recipient_id: args.recipientId, p_content: args.content });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notices }),
  });
}

export function useMarkNoticesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notices }),
  });
}
