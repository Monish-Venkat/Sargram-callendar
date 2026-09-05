import { FormEvent, useEffect, useState } from "react";
import type { AssignmentStatus, MemberRole } from "../lib/supabase";
import {
  useAddSharedUpdate, useAssignments, useAssignableMembers, useCreateAssignment,
  useMarkNoticesRead, useNotices, usePrivateNote, useSavePrivateNote, useSendNotice, useSharedUpdates,
  useUpdateAssignment, useTeamUpdates, useAddTeamUpdate,
} from "../hooks/useSupabase";

type Member = { id: string; name: string; role: MemberRole; core_college?: string };

const statusLabel: Record<AssignmentStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

export default function Workspace({ member }: { member: Member }) {
  const isCore = member.role === "core";
  const teamUpdates = useTeamUpdates();
  const postTeamUpdate = useAddTeamUpdate();
  const [teamText, setTeamText] = useState("");
  const canAssign = isCore || member.role === "teacher";
  const { data: assignments = [], isLoading: loadingTasks } = useAssignments();
  const { data: assignees = [] } = useAssignableMembers();
  const college = member.core_college ?? 'nhce';
  const [board, setBoard] = useState(college);
  const visibleBoard = college === 'nhce' ? board : college;
  const { data: updates = [] } = useSharedUpdates(isCore, visibleBoard);
  const { data: privateNote = "" } = usePrivateNote();
  const { data: notices = [] } = useNotices();
  const createTask = useCreateAssignment();
  const updateTask = useUpdateAssignment();
  const addUpdate = useAddSharedUpdate();
  const savePrivate = useSavePrivateNote();
  const sendNotice = useSendNotice();
  const markNoticesRead = useMarkNoticesRead();

  const [task, setTask] = useState({ title: "", description: "", assigneeId: "", dueDate: "", mediaLink: "" });
  const [sharedText, setSharedText] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState({ recipientId: "", content: "" });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setNote(privateNote), [privateNote]);
  useEffect(() => {
    if (assignees.length && !task.assigneeId) setTask((current) => ({ ...current, assigneeId: assignees[0].id }));
  }, [assignees, task.assigneeId]);
  useEffect(() => {
    if (member.role === "event_head" && notices.some((item) => !item.read_at)) void markNoticesRead.mutateAsync();
  }, [member.role, notices, markNoticesRead]);

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await createTask.mutateAsync(task);
      setTask({ title: "", description: "", assigneeId: assignees[0]?.id ?? "", dueDate: "", mediaLink: "" });
      setMessage("Task assigned.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not assign task."); }
  }

  async function submitShared(event: FormEvent) {
    event.preventDefault();
    if (!sharedText.trim()) return;
    try {
      await addUpdate.mutateAsync(sharedText);
      setSharedText("");
      setBoard(college);
    } catch (error) { setMessage((error as { message?: string }).message ?? 'Could not post Core update'); }
  }

  async function submitNotice(event: FormEvent) {
    event.preventDefault();
    if (!notice.recipientId || !notice.content.trim()) return;
    try {
      await sendNotice.mutateAsync(notice);
      setNotice({ recipientId: "", content: "" });
      setMessage("Event Head notified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send notice."); }
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div><p className="eyebrow">SARGAM operations</p><h2>Workboard</h2><p>Tasks, updates, and your personal working space.</p></div>
        {message && <span className="workspace-flash">{message}</span>}
      </header>

      <section className="workspace-card" aria-labelledby="team-updates-heading">
        <div className="section-heading"><h3 id="team-updates-heading">Team updates</h3><span>Everyone on the team can read and post</span></div>
        <form className="workspace-form" onSubmit={async (event) => {
          event.preventDefault();
          if (!teamText.trim() || postTeamUpdate.isPending) return;
          try { await postTeamUpdate.mutateAsync(teamText.trim()); setTeamText(""); } catch { /* Mutation error is displayed below; preserve the draft. */ }
        }}>
          <textarea aria-label="Team update" value={teamText} onChange={(event) => setTeamText(event.target.value)} placeholder="Share progress, announcements, or anything the whole team should know…" rows={3} />
          <button className="btn btn-primary" disabled={postTeamUpdate.isPending || !teamText.trim()}>{postTeamUpdate.isPending ? "Posting…" : "Post team update"}</button>
          {postTeamUpdate.isError && <p role="alert">Could not post your update. Your draft is saved here; please try again.</p>}
        </form>
        <div className="update-feed" aria-live="polite">
          {teamUpdates.isPending ? <p>Loading team updates…</p> : teamUpdates.isError ? <p role="alert">Team updates could not load. <button className="btn btn-secondary" onClick={() => void teamUpdates.refetch()}>Retry</button></p> : teamUpdates.data?.length ? teamUpdates.data.map((update) => <article key={update.id}><p>{update.content}</p><small>{update.author_name} · {new Date(update.created_at).toLocaleString()}</small></article>) : <p>No team updates yet. Share the first update.</p>}
        </div>
      </section>

      {canAssign && <section className="workspace-card assignment-composer">
        <div className="section-heading"><h3>Assign a task</h3><span>{isCore ? "Core → Core / Event Heads" : "Teacher → Core"}</span></div>
        <form className="workspace-form task-form" onSubmit={submitTask}>
          <input required value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Task title" />
          <select value={task.assigneeId} onChange={(e) => setTask({ ...task, assigneeId: e.target.value })} required>
            {assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role === "event_head" ? "Event Head" : "Core"}</option>)}
          </select>
          <input type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
          <textarea value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} placeholder="Add context, checklist items, or success criteria (optional)" rows={3} />
          <input type="url" value={task.mediaLink} onChange={(e) => setTask({ ...task, mediaLink: e.target.value })} placeholder="Reference / reel / drive link (optional)" />
          <button className="btn btn-primary" disabled={createTask.isPending || !assignees.length}>{createTask.isPending ? "Assigning…" : "Assign task"}</button>
        </form>
      </section>}

      <section className="workspace-card"><div className="section-heading"><h3>{member.role === "teacher" ? "Core task monitoring" : "Task updater"}</h3><span>Update your task with one click</span></div>
        <div className="task-list">
          {loadingTasks && <p className="muted">Loading tasks…</p>}
          {!loadingTasks && assignments.length === 0 && <p className="muted">No tasks assigned yet.</p>}
          {assignments.map((item) => {
            const own = item.assignee_id === member.id;
            return <article className={`task-item ${item.status}`} key={item.id}>
              <div className="task-main"><div className="task-title-line"><h4>{item.title}</h4><span className={`task-status ${item.status}`}>{statusLabel[item.status]}</span></div>
                {item.description && <p>{item.description}</p>}
                <small>For <b>{item.assignee_name}</b> · assigned by {item.assigned_by_name}{item.due_date ? ` · due ${item.due_date}` : ""}</small>
                {item.media_link && <a className="media-link" href={item.media_link} target="_blank" rel="noreferrer">Open media / reference ↗</a>}
              </div>
              {own && <div className="task-actions"><select value={item.status} onChange={(e) => void updateTask.mutateAsync({ taskId: item.id, status: e.target.value })}>{Object.entries(statusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <input aria-label="Media work link" type="url" placeholder="Add reel / media link" onBlur={(e) => { if (e.target.value) void updateTask.mutateAsync({ taskId: item.id, status: item.status, mediaLink: e.target.value }); }} />
              </div>}
            </article>;
          })}
        </div>
      </section>

      {isCore && <section className="workspace-card"><div className="section-heading"><h3>{visibleBoard.toUpperCase()} Core updates</h3><span>Posts go to your college's board. NHCE Core can view all boards.</span></div>
        {college === 'nhce' && <label>View college <select className="filter-select" value={board} onChange={(e) => setBoard(e.target.value)}>{['nhce','nhcm','nhck'].map((c) => <option key={c} value={c}>{c.toUpperCase()} Core</option>)}</select></label>}
        <form className="workspace-form" onSubmit={submitShared}><textarea value={sharedText} onChange={(e) => setSharedText(e.target.value)} placeholder="Share what changed, what is blocked, or what needs attention…" rows={3} /><button className="btn btn-primary" disabled={addUpdate.isPending}>Post update</button></form>
        <div className="update-feed">{updates.length === 0 ? <p className="muted">No shared updates yet.</p> : updates.map((update) => <article key={update.id}><p>{update.content}</p><small>{update.author_name} · {new Date(update.created_at).toLocaleString()}</small></article>)}</div>
      </section>}

      {isCore && <section className="workspace-card"><div className="section-heading"><h3>Notify an Event Head</h3><span>Direct in-app notice</span></div>
        <form className="workspace-form notice-form" onSubmit={submitNotice}><select value={notice.recipientId} onChange={(e) => setNotice({ ...notice, recipientId: e.target.value })} required><option value="">Choose an Event Head</option>{assignees.filter((person) => person.role === "event_head").map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select><textarea value={notice.content} onChange={(e) => setNotice({ ...notice, content: e.target.value })} placeholder="Write the notice…" rows={3} required /><button className="btn btn-primary" disabled={sendNotice.isPending}>Send notice</button></form>
      </section>}

      {member.role === "event_head" && <section className="workspace-card"><div className="section-heading"><h3>Core notices</h3><span>Messages from the Core Team</span></div><div className="update-feed">{notices.length === 0 ? <p className="muted">No notices yet.</p> : notices.map((item) => <article key={item.id}><p>{item.content}</p><small>{item.sender_name} · {new Date(item.created_at).toLocaleString()}</small></article>)}</div></section>}

      <section className="workspace-card private-note"><div className="section-heading"><h3>My private notepad</h3><span>Only you can see this</span></div><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keep personal reminders, rough notes, or ideas here…" rows={7} /><div><button className="btn btn-secondary" onClick={() => void savePrivate.mutateAsync(note)} disabled={savePrivate.isPending}>{savePrivate.isPending ? "Saving…" : "Save private note"}</button></div></section>
    </div>
  );
}
