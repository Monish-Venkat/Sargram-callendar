import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Calendar from "../components/Calendar";
import AdminPanel from "./AdminPanel";

type Member = {
  _id: string;
  name: string;
  role: "event_head" | "core" | "teacher";
  eventName?: string;
};

export default function Dashboard({ member }: { member: Member }) {
  const viewable = (useQuery(api.members.listViewableMembers) ?? []) as Member[];
  const [selectedId, setSelectedId] = useState<string>(member._id);
  const [view, setView] = useState<"calendar" | "manage">("calendar");

  const selected = viewable.find((m) => m._id === selectedId) ?? member;
  const canEditSelected = selected._id === member._id && member.role !== "teacher";
  const isCore = member.role === "core";

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="role-badge">{roleLabel(member.role)}</div>
        <div className="member-self">
          {member.name}
          {member.eventName ? ` · ${member.eventName}` : ""}
        </div>

        {isCore && (
          <div className="view-switch">
            <button
              className={view === "calendar" ? "active" : ""}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              className={view === "manage" ? "active" : ""}
              onClick={() => setView("manage")}
            >
              Manage Team
            </button>
          </div>
        )}

        {view === "calendar" && viewable.length > 1 && (
          <>
            <div className="sidebar-title">
              {member.role === "teacher" ? "All members" : "View logs"}
            </div>
            <ul className="member-list">
              {viewable.map((m) => (
                <li key={m._id}>
                  <button
                    className={m._id === selectedId ? "active" : ""}
                    onClick={() => setSelectedId(m._id)}
                  >
                    <span>{m.name}</span>
                    <span className="tag">{m.eventName ?? "Core"}</span>
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
        ) : (
          <Calendar
            key={selected._id}
            memberId={selected._id}
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
