import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type Role = "event_head" | "core" | "teacher";

export default function AdminPanel() {
  const invites = useQuery(api.members.listInvites) ?? [];
  const members = useQuery(api.members.listAllMembers) ?? [];
  const events = useQuery(api.members.listEvents) ?? [];

  const addInvite = useMutation(api.members.addInvite);
  const removeInvite = useMutation(api.members.deleteInvite);
  const addEvent = useMutation(api.members.addEvent);

  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "event_head" as Role,
    eventName: "",
  });
  const [newEventName, setNewEventName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await addInvite({
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        role: form.role,
        eventName: form.role === "event_head" ? form.eventName.trim() : undefined,
      });
      setStatus(`Added ${form.name || form.email} as ${roleLabel(form.role)}. They can now sign in.`);
      setForm({ email: "", name: "", role: "event_head", eventName: "" });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventName.trim()) return;
    await addEvent({ name: newEventName.trim() });
    setNewEventName("");
  }

  return (
    <div className="admin-panel">
      <section className="admin-card">
        <h3>Add a member</h3>
        <form onSubmit={submitInvite} className="admin-form">
          <input
            type="email"
            placeholder="Email (they'll sign in with this)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="event_head">Event Head</option>
            <option value="core">Core Team</option>
            <option value="teacher">Teacher In-charge</option>
          </select>
          {form.role === "event_head" && (
            <select
              value={form.eventName}
              onChange={(e) => setForm({ ...form, eventName: e.target.value })}
              required
            >
              <option value="" disabled>
                Select event / department
              </option>
              {events.map((ev) => (
                <option key={ev._id} value={ev.name}>
                  {ev.name}
                </option>
              ))}
            </select>
          )}
          <button className="primary" type="submit">
            Add member
          </button>
        </form>
        {form.role === "event_head" && events.length === 0 && (
          <p className="admin-hint">Add at least one event/department below first.</p>
        )}
        {status && <p className="admin-status">{status}</p>}
      </section>

      <section className="admin-card">
        <h3>Events / Departments</h3>
        <form onSubmit={submitEvent} className="admin-form inline">
          <input
            type="text"
            placeholder="e.g. Battle of Bands"
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        <ul className="admin-list">
          {events.map((ev) => (
            <li key={ev._id}>{ev.name}</li>
          ))}
          {events.length === 0 && <li className="muted">No events added yet</li>}
        </ul>
      </section>

      <section className="admin-card">
        <h3>Pending invites ({invites.length})</h3>
        <p className="admin-hint">Not signed in yet — they'll get access the moment they log in with this email.</p>
        <ul className="admin-list">
          {invites.map((inv) => (
            <li key={inv._id}>
              <span>
                {inv.name} — {inv.email} · {roleLabel(inv.role)}
                {inv.eventName ? ` · ${inv.eventName}` : ""}
              </span>
              <button className="link-btn" onClick={() => removeInvite({ inviteId: inv._id })}>
                Remove
              </button>
            </li>
          ))}
          {invites.length === 0 && <li className="muted">No pending invites</li>}
        </ul>
      </section>

      <section className="admin-card">
        <h3>Active members ({members.length})</h3>
        <ul className="admin-list">
          {members.map((m) => (
            <li key={m._id}>
              <span>
                {m.name} — {m.email} · {roleLabel(m.role)}
                {m.eventName ? ` · ${m.eventName}` : ""}
              </span>
            </li>
          ))}
          {members.length === 0 && <li className="muted">No one has signed in yet</li>}
        </ul>
      </section>
    </div>
  );
}

function roleLabel(role: Role) {
  if (role === "teacher") return "Teacher In-charge";
  if (role === "core") return "Core Team";
  return "Event Head";
}
