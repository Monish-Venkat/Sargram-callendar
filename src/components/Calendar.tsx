import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar({
  memberId,
  memberName,
  editable,
}: {
  memberId: string;
  memberName: string;
  editable: boolean;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const logs = useQuery(api.taskLogs.logsForMember, {
    memberId: memberId as Id<"members">,
  });
  const upsertLog = useMutation(api.taskLogs.upsertLog);
  const deleteLog = useMutation(api.taskLogs.deleteLog);

  const logMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs ?? []) m.set(l.date, l.description);
    return m;
  }, [logs]);

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const cells: (number | null)[] = Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function fmt(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function openDay(d: number) {
    const key = fmt(year, month, d);
    setOpenDate(key);
    setDraft(logMap.get(key) ?? "");
  }

  async function save() {
    if (!openDate) return;
    if (draft.trim() === "") {
      await deleteLog({ date: openDate });
    } else {
      await upsertLog({ date: openDate, description: draft.trim() });
    }
    setOpenDate(null);
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="calendar-wrap">
      <div className="calendar-header">
        <h2>{memberName}&apos;s Log</h2>
        <div className="month-nav">
          <button onClick={prevMonth} aria-label="Previous month">‹</button>
          <span>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="calendar-grid weekdays">
        {WEEKDAYS.map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cell empty" />;
          const key = fmt(year, month, d);
          const has = logMap.has(key);
          const isToday =
            year === today.getFullYear() &&
            month === today.getMonth() &&
            d === today.getDate();
          return (
            <button
              key={i}
              className={`cell${has ? " has-log" : ""}${isToday ? " today" : ""}`}
              onClick={() => openDay(d)}
            >
              <span className="date-num">{d}</span>
              {has && <span className="dot" />}
            </button>
          );
        })}
      </div>

      {openDate && (
        <div className="modal-backdrop" onClick={() => setOpenDate(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{openDate}</h3>
            {editable ? (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What did you work on today?"
                  rows={6}
                  autoFocus
                />
                <div className="modal-actions">
                  <button onClick={() => setOpenDate(null)}>Cancel</button>
                  <button className="primary" onClick={save}>Save</button>
                </div>
              </>
            ) : (
              <p className="readonly-text">
                {logMap.get(openDate) || "No entry for this date."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
