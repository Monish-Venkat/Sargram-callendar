import { useState, useMemo } from "react";
import { useViewableMembers, usePendingReviewLogs, useAllLogsForReview, useReviewLog, useBulkReviewLogs } from "../hooks/useSupabase";

type Member = {
  id: string;
  name: string;
  role: "event_head" | "core" | "teacher";
  event_name?: string;
};

type TaskLogWithMember = {
  id: string;
  member_id: string;
  date: string;
  description: string;
  updated_at: string;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  member_name: string;
  member_role: "event_head" | "core" | "teacher";
  member_event_name: string | null;
};

export default function ReviewDashboard({ member }: { member: Member }) {
  const [filter, setFilter] = useState<"pending" | "all" | "reviewed">("pending");
  const [selectedMemberId, setSelectedMemberId] = useState<string | "all">("all");
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const { data: viewableMembers = [] } = useViewableMembers();
  
  const { data: pendingLogsData = [] } = usePendingReviewLogs();
  const { data: allLogsData = [] } = useAllLogsForReview(selectedMemberId === "all" ? undefined : selectedMemberId);

  const logsData = filter === "pending" ? pendingLogsData : allLogsData;

  const reviewLog = useReviewLog();
  const bulkReview = useBulkReviewLogs();

  const logsWithMembers = useMemo(() => {
    return logsData.map((log) => {
      const logMember = viewableMembers.find((m) => m.id === log.member_id);
      return { ...log, member: logMember };
    });
  }, [logsData, viewableMembers]);

  const pendingLogs = logsWithMembers.filter((l) => !l.reviewed);
  const reviewedLogs = logsWithMembers.filter((l) => l.reviewed);

  const displayLogs = useMemo(() => {
    if (filter === "pending") return pendingLogs;
    if (filter === "reviewed") return reviewedLogs;
    return logsWithMembers;
  }, [filter, pendingLogs, reviewedLogs, logsWithMembers]);

  const filteredMembers = viewableMembers.filter((m) => m.role !== "teacher");

  async function handleToggleReview(logId: string, reviewed: boolean) {
    await reviewLog.mutateAsync({ logId, reviewed });
  }

  async function handleBulkReview(reviewed: boolean) {
    if (selectedLogs.size === 0) return;
    await bulkReview.mutateAsync({ logIds: Array.from(selectedLogs), reviewed });
    setSelectedLogs(new Set());
    setSelectAll(false);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  function getAvatarColor(id: string) {
    const hash = id.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    return `hsl(${hash % 360}, 65%, 50%)`;
  }

  return (
    <div className="review-dashboard">
      <div className="review-header">
        <div>
          <h2>Review Logs</h2>
          <p className="review-subtitle">{pendingLogs.length} pending · {reviewedLogs.length} reviewed</p>
        </div>
        <div className="review-filters">
          <div className="filter-group">
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="filter-select">
              <option value="pending">Pending Review</option>
              <option value="all">All Logs</option>
              <option value="reviewed">Reviewed</option>
            </select>
            <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} className="filter-select">
              <option value="all">All Members</option>
              {filteredMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.event_name ? `· ${m.event_name}` : ""}</option>
              ))}
            </select>
          </div>
          {selectedLogs.size > 0 && (
            <div className="bulk-actions">
              <span>{selectedLogs.size} selected</span>
              <button className="btn btn-primary" onClick={() => handleBulkReview(true)} disabled={bulkReview.isPending}>Approve</button>
              <button className="btn btn-secondary" onClick={() => handleBulkReview(false)} disabled={bulkReview.isPending}>Reject</button>
              <button className="btn btn-ghost" onClick={() => { setSelectedLogs(new Set()); setSelectAll(false); }}>Clear</button>
            </div>
          )}
        </div>
      </div>

      {displayLogs.length === 0 ? (
        <div className="review-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>{filter === "pending" ? "No pending reviews" : filter === "reviewed" ? "No reviewed logs" : "No logs found"}</p>
        </div>
      ) : (
        <div className="review-table-wrap">
          <table className="review-table">
            <thead>
              <tr>
                <th style={{ width: "48px" }}>
                  <input
                    type="checkbox"
                    checked={selectAll && displayLogs.length > 0}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectAll(checked);
                      if (checked) {
                        setSelectedLogs(new Set(displayLogs.map((l) => l.id)));
                      } else {
                        setSelectedLogs(new Set());
                      }
                    }}
                  />
                </th>
                <th>Member</th>
                <th>Date</th>
                <th>Task Description</th>
                <th style={{ width: "140px" }}>Status</th>
                <th style={{ width: "90px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayLogs.map((log) => (
                <tr key={log.id} className={log.reviewed ? "reviewed" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedLogs.has(log.id)}
                      onChange={(e) => {
                        const next = new Set(selectedLogs);
                        if (e.target.checked) next.add(log.id);
                        else next.delete(log.id);
                        setSelectedLogs(next);
                        setSelectAll(next.size === displayLogs.length && displayLogs.length > 0);
                      }}
                    />
                  </td>
                  <td>
                    <div className="member-cell">
                      <div className="avatar" style={{ backgroundColor: log.member ? getAvatarColor(log.member.id) : "#888" }}>
                        {log.member ? getInitials(log.member.name) : "?"}
                      </div>
                      <div>
                        <span className="member-name">{log.member?.name || "Unknown"}</span>
                        {log.member?.event_name && <span className="member-event">{log.member.event_name}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="date-cell">{formatDate(log.date)}</td>
                  <td className="desc-cell">
                    <pre>{log.description || "—"}</pre>
                  </td>
                  <td>
                    <span className={`status-badge ${log.reviewed ? "approved" : "pending"}`}>
                      {log.reviewed ? "Approved" : "Pending"}
                    </span>
                    {log.reviewed && log.reviewed_at && (
                      <span className="review-meta">by {log.reviewed_by ? "Core" : "?"} · {new Date(log.reviewed_at).toLocaleDateString()}</span>
                    )}
                  </td>
                  <td>
                    {log.reviewed ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleToggleReview(log.id, false)}
                        title="Unapprove"
                        disabled={reviewLog.isPending}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleToggleReview(log.id, true)}
                        title="Approve"
                        disabled={reviewLog.isPending}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}