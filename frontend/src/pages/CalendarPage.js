import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import { localDate, shiftMonth, parseLocalDate } from "../dates";

export default function CalendarPage({ auth, selectedBaby, onOpenSettings }) {
  const [currentMonth, setCurrentMonth] = useState(() => shiftMonth(new Date(), 0));
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  const today = localDate();
  const monthStart = localDate(currentMonth);
  const monthEnd = localDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 12));
  const historyKey = `${selectedBaby?.id}-${monthStart}`;
  const currentHistory = history?.key === historyKey ? history : null;

  useEffect(() => {
    if (!selectedBaby) return;
    const controller = new AbortController();
    setError("");
    apiRequest(`/history?start_date=${monthStart}&end_date=${monthEnd}`, { token: auth.token, babyId: selectedBaby.id, signal: controller.signal })
      .then((data) => setHistory({ ...data, key: historyKey }))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [auth.token, selectedBaby, monthStart, monthEnd, historyKey, attempt]);

  const summaries = Object.fromEntries((currentHistory?.days || []).map((day) => [day.date, day]));
  const days = Array(currentMonth.getDay()).fill(null);
  for (let day = 1; day <= Number(monthEnd.slice(-2)); day += 1) days.push(`${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`);
  while (days.length % 7) days.push(null);
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  return <main className="app-page interactive-page"><section className="hero-panel">
    <header className="page-header compact-header">
      <div className="top-bar calendar-top-bar">
        <button className="btn btn-outline-dark" type="button" onClick={onOpenSettings}>Settings</button>
      </div>
      <div className="kicker">Family journal</div>
      <h1 className="page-title">{selectedBaby?.name || "Baby"}</h1>
      <p className="page-subtitle">Feeding, diapers, and little milestones.</p>
      <button className="btn btn-dark today-button" type="button" disabled={!selectedBaby} onClick={() => navigate(`/milk_track/${today}`)}>Log today</button>
    </header>
    <div className="content-grid">
      <section className="soft-card calendar-card">
        <div className="calendar-toolbar">
          <button aria-label="Previous month" className="btn btn-outline-dark" type="button" onClick={() => setCurrentMonth((value) => shiftMonth(value, -1))}>‹</button>
          <h2 className="calendar-month">{currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button aria-label="Next month" className="btn btn-outline-dark" type="button" onClick={() => setCurrentMonth((value) => shiftMonth(value, 1))}>›</button>
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button className="btn btn-outline-dark btn-sm" type="button" onClick={() => setCurrentMonth(shiftMonth(new Date(), 0))}>This month</button>
          {currentHistory?.earliest_date && <button className="btn btn-outline-dark btn-sm" type="button" onClick={() => setCurrentMonth(shiftMonth(parseLocalDate(currentHistory.earliest_date), 0))}>First records</button>}
        </div>
        <p className="small text-muted">A dot marks a day with saved records.</p>
        {error && <div className="alert alert-warning" role="alert">{error} <button className="btn btn-outline-dark btn-sm" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry history</button></div>}
        {!currentHistory && !error && selectedBaby && <p className="small" role="status">Loading history…</p>}
        <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}</div>
        {weeks.map((week, index) => <div key={index} className="calendar-row">
          {week.map((date, position) => <div key={date || position} className="calendar-day-wrap">
            {date ? <button aria-label={`${date}${summaries[date] ? ", has records" : ""}`} aria-current={date === today ? "date" : undefined} className={`btn calendar-day ${date === today ? "btn-primary" : "btn-outline-dark"}`} type="button" disabled={!selectedBaby} onClick={() => navigate(`/milk_track/${date}`)}>
              {Number(date.slice(-2))}{summaries[date] && <span className="history-dot" aria-hidden="true" />}
            </button> : <div className="calendar-empty" />}
          </div>)}
        </div>)}
      </section>
      <section className="soft-card full">
        <h2 className="section-title">Weekly totals</h2>
        <p className="small text-muted">Totals for the days shown in this month. Milk includes corrections.</p>
        {currentHistory ? <div className="weekly-totals">{weeks.filter((week) => week.some(Boolean)).map((week, index) => {
          const dates = week.filter(Boolean);
          const totals = dates.reduce((sum, date) => {
            const day = summaries[date];
            return { milk: sum.milk + (day?.milk_ml || 0), pee: sum.pee + (day?.pee_logs || 0), poop: sum.poop + (day?.poop_logs || 0), breastfeeds: sum.breastfeeds + (day?.breastfeeding_logs || 0) };
          }, { milk: 0, pee: 0, poop: 0, breastfeeds: 0 });
          return <div key={index} className="weekly-row"><span>{Number(dates[0].slice(-2))}–{Number(dates[dates.length - 1].slice(-2))}</span><strong>{Number(totals.milk.toFixed(2))} ml</strong><span>{totals.pee} pee · {totals.poop} poop</span>{totals.breastfeeds > 0 && <small className="weekly-breastfeeding">🤱 Breastfeeds: {totals.breastfeeds}</small>}</div>;
        })}</div> : <p className="small">{error ? "Reconnect to view weekly totals." : "Loading totals…"}</p>}
        {currentHistory?.earliest_date && <p className="small text-muted mt-3 mb-0">Records start on {currentHistory.earliest_date}. <button className="btn btn-outline-dark btn-sm" type="button" onClick={() => navigate(`/milk_track/${currentHistory.earliest_date}`)}>Open first day</button></p>}
      </section>
    </div>
  </section></main>;
}
