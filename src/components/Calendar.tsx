import { useMemo, useState, useEffect } from "react";
import { useLogsForMember, useUpsertLog, useDeleteLog } from "../hooks/useSupabase";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FINAL_LOG_DATE = new Date(2026, 9, 31, 23, 59, 59);

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
  const [mediaLink, setMediaLink] = useState("");

  const { data: logs = [], isLoading } = useLogsForMember(memberId);
  const upsertLog = useUpsertLog();
  const deleteLog = useDeleteLog();

  const logMap = useMemo(() => {
    const m = new Map<string, { description: string; reviewed?: boolean; mediaLink?: string | null }>();
    for (const l of logs) m.set(l.date, { description: l.description, reviewed: l.reviewed, mediaLink: l.media_link });
    return m;
  }, [logs]);

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const cells: (number | null)[] = Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = today.toISOString().split("T")[0];

  function fmt(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function openDay(d: number) {
    if (!editable) return;
    const key = fmt(year, month, d);
    setOpenDate(key);
    setDraft(logMap.get(key)?.description ?? "");
    setMediaLink(logMap.get(key)?.mediaLink ?? "");
  }

  async function save() {
    if (!openDate) return;
    try {
      if (draft.trim() === "" && mediaLink.trim() === "") {
        await deleteLog.mutateAsync(openDate);
      } else {
        await upsertLog.mutateAsync({ date: openDate, description: draft.trim(), mediaLink: mediaLink.trim() });
      }
      setOpenDate(null);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else { setMonth((m) => m - 1); }
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else { setMonth((m) => m + 1); }
  }
  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!openDate) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      if (e.key === "Escape") setOpenDate(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openDate]);

  return (
    <div className="calendar-wrap">
      <div className="calendar-header">
        <div className="calendar-title">
          <h2>{memberName}&apos;s Task Log</h2>
          <span className="member-role">Daily Activity Calendar</span>
        </div>
        <div className="month-nav">
          <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button className="month-label" onClick={goToToday} aria-label="Go to today">
            {MONTHS[month]} {year}
          </button>
          <button className="nav-btn" onClick={nextMonth} aria-label="Next month">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {year !== today.getFullYear() || month !== today.getMonth() && (
            <button className="btn btn-ghost btn-sm today-btn" onClick={goToToday}>Today</button>
          )}
        </div>
      </div>

      <div className="calendar-grid weekdays" role="row">
        {WEEKDAYS.map((d) => (
          <div key={d} className="weekday" role="columnheader">{d}</div>
        ))}
      </div>

      <div className="calendar-grid" role="grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cell empty" role="gridcell" />;
          const key = fmt(year, month, d);
          const log = logMap.get(key);
          const has = !!log;
          const isToday = key === todayStr;
          const isAfterDeadline = new Date(`${key}T00:00:00`) > FINAL_LOG_DATE;
          const isReviewed = log?.reviewed === true;
          return (
            <button
              key={i}
              className={`cell${has ? " has-log" : ""}${isToday ? " today" : ""}${isAfterDeadline ? " future" : ""}${isReviewed ? " reviewed" : ""}`}
              onClick={() => openDay(d)}
              disabled={!editable || isAfterDeadline}
              aria-label={key}
              role="gridcell"
              tabIndex={editable && !isAfterDeadline ? 0 : -1}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openDay(d); }}
            >
              <span className="date-num">{d}</span>
              {has && (
                <>
                  <span className={`log-indicator ${isReviewed ? "reviewed" : ""}`} />
                  {isReviewed && <span className="review-check" aria-label="Reviewed">✓</span>}
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span className="legend-item"><span className="legend-dot has-log" /> Has entry</span>
        <span className="legend-item"><span className="legend-dot reviewed" /> Reviewed</span>
        <span className="legend-item"><span className="legend-dot today" /> Today</span>
        <span className="legend-item"><span className="legend-dot future" /> After Oct 31</span>
      </div>

      {openDate && (
        <div className="modal-backdrop" onClick={() => setOpenDate(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{openDate}</h3>
              <button className="modal-close" onClick={() => setOpenDate(null)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {editable ? (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What did you work on today? Add as much or as little detail as you need."
                  rows={6}
                  autoFocus
                  className="modal-textarea"
                />
                <input className="media-input" type="url" value={mediaLink} onChange={(e) => setMediaLink(e.target.value)} placeholder="Reel, post, Drive, or media link (optional)" />
                <div className="modal-footer">
                  <span className="char-count">No minimum length</span>
                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => setOpenDate(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={save} disabled={upsertLog.isPending || deleteLog.isPending}>
                      {(upsertLog.isPending || deleteLog.isPending) ? "Saving…" : draft.trim() === "" && mediaLink.trim() === "" ? "Delete Entry" : "Save Entry"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="modal-readonly">
                {logMap.get(openDate)?.description ? (
                  <>
                    <div className={`readonly-content ${logMap.get(openDate)?.reviewed ? "reviewed" : ""}`}>
                      <pre>{logMap.get(openDate)!.description}</pre>
                      {logMap.get(openDate)?.mediaLink && <a className="media-link" href={logMap.get(openDate)!.mediaLink!} target="_blank" rel="noreferrer">Open media link ↗</a>}
                    </div>
                    {logMap.get(openDate)?.reviewed && (
                      <div className="review-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Reviewed by Core Team</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="empty-state">No entry for this date.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
