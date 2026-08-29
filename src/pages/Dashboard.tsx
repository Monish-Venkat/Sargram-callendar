import { useState } from "react";
import { useViewableMembers } from "../hooks/useSupabase";
import Calendar from "../components/Calendar";
import AdminPanel from "./AdminPanel";
import ReviewDashboard from "../components/ReviewDashboard";
import Workspace from "../components/Workspace";

type Member = {
  id: string;
  name: string;
  role: "event_head" | "core" | "teacher";
  eventName?: string;
};

export default function Dashboard({ member }: { member: Member }) {
  const { data: viewable = [] } = useViewableMembers();
  const [selectedId, setSelectedId] = useState<string>(member.id);
  const [view, setView] = useState<"calendar" | "workspace" | "review" | "manage">("calendar");

  const selected = viewable.find((m) => m.id === selectedId) ?? member;
  const canEditSelected = selected.id === member.id && member.role !== "teacher";
  const isCore = member.role === "core";
  const isTeacher = member.role === "teacher";

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="role-badge">{roleLabel(member.role)}</div>
        <div className="member-self">
          {member.name}
          {member.eventName ? ` · ${member.eventName}` : ""}
        </div>

        <nav className="sidebar-nav">
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </button>
          <button
            className={view === "workspace" ? "active" : ""}
            onClick={() => setView("workspace")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" />
            </svg>
            Workboard
          </button>
          {(isCore || isTeacher) && (
            <button
              className={view === "review" ? "active" : ""}
              onClick={() => setView("review")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Review Logs
            </button>
          )}
          {isCore && (
            <button
              className={view === "manage" ? "active" : ""}
              onClick={() => setView("manage")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Manage Team
            </button>
          )}
        </nav>

        {view === "calendar" && viewable.length > 1 && (
          <>
            <div className="sidebar-title">
              {member.role === "teacher" ? "All members" : "View logs"}
            </div>
            <ul className="member-list">
              {viewable.map((m) => (
                <li key={m.id}>
                  <button
                    className={m.id === selectedId ? "active" : ""}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span>{m.name}</span>
                    <span className="tag">{m.event_name ?? "Core"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <main className="main-panel">
        {view === "manage" && isCore ? (
          <AdminPanel />
        ) : view === "review" && (isCore || isTeacher) ? (
          <ReviewDashboard member={member} />
        ) : view === "workspace" ? (
          <Workspace member={member} />
        ) : (
          <Calendar
            key={selected.id}
            memberId={selected.id}
            memberName={selected.name}
            editable={canEditSelected}
          />
        )}
      </main>
    </div>
  );
}

function roleLabel(role: Member["role"]) {
  if (role === "teacher") return "Teacher In-charge";
  if (role === "core") return "Core Team";
  return "Event Head";
}
