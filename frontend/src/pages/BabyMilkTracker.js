import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { apiRequest } from "../api";
import { localDate, shiftDate, parseLocalDate, formatDate } from "../dates";
import MilkAmountButtons from "./MilkAmountButtons";

export default function BabyMilkTracker(props) {
  const { date } = useParams();
  if (!props.selectedBaby || !parseLocalDate(date)) return <Navigate to="/" replace />;
  return <TrackerDay key={date} {...props} date={date} />;
}

function TrackerDay({ auth, selectedBaby, onOpenSettings, date }) {
  const navigate = useNavigate();
  const [day, setDay] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const actionLock = useRef(false);
  const loadController = useRef(null);
  const [editingLog, setEditingLog] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [deleteLog, setDeleteLog] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const requestOptions = useMemo(() => ({ token: auth.token, babyId: selectedBaby.id }), [auth.token, selectedBaby.id]);

  const refreshLogs = useCallback(async ({ showLoading = false } = {}) => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setError("");
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiRequest(`/days/${date}`, { ...requestOptions, signal: controller.signal });
      if (controller.signal.aborted) return false;
      setDay(data);
      return true;
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
      return false;
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [date, requestOptions]);

  useEffect(() => {
    refreshLogs({ showLoading: true });
    const handleVisible = () => { if (!document.hidden && !actionLock.current) refreshLogs(); };
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleVisible);
    return () => {
      loadController.current?.abort();
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleVisible);
    };
  }, [refreshLogs]);

  const runAction = async (action, message) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsSaving(true); setError(""); setStatus("");
    try {
      await action();
      setStatus(message);
      const refreshed = await refreshLogs();
      if (!refreshed) setError("Saved, but the latest records could not be loaded. Use Refresh to check them.");
    } catch (err) { setError(err.message); }
    finally { actionLock.current = false; setIsSaving(false); }
  };

  const handleAddEntry = (amount, note = "") => {
    const parsed = amount === "" ? 0 : Number(amount);
    if (!Number.isFinite(parsed) || (parsed === 0 && !note.trim())) {
      setError("Enter an amount or a note."); return;
    }
    runAction(async () => {
      await apiRequest("/entries", { ...requestOptions, method: "POST", body: { date, amount: parsed, notes: note.trim() } });
      setCustomAmount(""); setCustomNote("");
    }, "Milk entry saved.");
  };

  const logs = [
    ...(day?.entries || []).map((log) => ({ ...log, type: "Milk", endpoint: "entries" })),
    ...(day?.pee_logs || []).map((log) => ({ ...log, type: "Pee", endpoint: "pee" })),
    ...(day?.poop_logs || []).map((log) => ({ ...log, type: "Poop", endpoint: "poop" })),
    ...(day?.breastfeeding_logs || []).map((log) => ({ ...log, type: "Breastfeeding", endpoint: "breastfeeding" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id);
  const total = Number((day?.entries || []).reduce((sum, log) => sum + log.amount, 0).toFixed(2));
  const progress = day?.goal ? Math.min(100, Math.max(0, total / day.goal * 100)) : 0;
  const busy = isSaving || isLoading;
  const logKey = (log) => `${log.type}-${log.id}`;
  const openDetails = () => {
    setGoalDraft(day?.goal ? String(day.goal) : "");
    setWeightDraft(day?.measurement ? String(day.measurement.weight) : "");
    setHeightDraft(day?.measurement ? String(day.measurement.height) : "");
    setDetailsOpen((value) => !value);
  };
  const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time unavailable";

  return <main className="app-page interactive-page"><section className="hero-panel">
    <header className="tracker-header compact-header">
      <div className="top-bar">
        <Link to="/" className={`btn btn-outline-dark ${isSaving ? "disabled" : ""}`} aria-disabled={isSaving}>Calendar</Link>
        <button className="btn btn-outline-dark" type="button" onClick={onOpenSettings} disabled={isSaving}>Settings</button>
      </div>
      <h1 className="page-title">{selectedBaby.name}</h1>
      <p className="page-subtitle">{formatDate(date)}</p>
      <nav className="day-navigation" aria-label="Tracker date">
        <button className="btn btn-outline-dark" type="button" aria-label="Previous day" disabled={isSaving} onClick={() => navigate(`/milk_track/${shiftDate(date, -1)}`)}>‹</button>
        <button className="btn btn-outline-dark" type="button" disabled={isSaving || date === localDate()} onClick={() => navigate(`/milk_track/${localDate()}`)}>Today</button>
        <button className="btn btn-outline-dark" type="button" aria-label="Next day" disabled={isSaving} onClick={() => navigate(`/milk_track/${shiftDate(date, 1)}`)}>›</button>
      </nav>
    </header>
    <div className="content-grid">
      <section className="soft-card full">
        <h2 className="section-title">Daily summary</h2>
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-value">{day ? total : "—"}<small> ml</small></div><div className="stat-label">Milk</div></div>
          <div className="stat-card"><div className="stat-value">{day ? day.pee_logs.length : "—"}</div><div className="stat-label">Pee</div></div>
          <div className="stat-card"><div className="stat-value">{day ? day.poop_logs.length : "—"}</div><div className="stat-label">Poop</div></div>
        </div>
        {day && <p className="small mt-3 mb-0"><span aria-hidden="true">🤱</span> Breastfeeds: {(day.breastfeeding_logs || []).length}</p>}
        {day?.goal && <div className="goal-progress mt-3"><div className="small mb-1">Your daily goal: {total} / {day.goal} ml</div>
          <progress aria-label="Daily milk goal" max="100" value={progress} /> <span className="small">{Math.round(progress)}%</span></div>}
        {day?.measurement && <p className="small mt-3 mb-0">Weight: {day.measurement.weight} kg · Height: {day.measurement.height} cm</p>}
      </section>

      <section className="soft-card full">
        <h2 className="section-title">Add entry</h2>
        <div className="quick-actions">
          {["Pee", "Poop"].map((type) => <button key={type} className={`btn ${type === "Pee" ? "btn-warning" : "btn-secondary"}`} type="button" disabled={busy} onClick={() => runAction(() => apiRequest(`/${type.toLowerCase()}`, { ...requestOptions, method: "POST", body: { date } }), `${type} saved.`)}>{type}</button>)}
          <button className="btn btn-success breastfeed-action" type="button" aria-label="Log breastfeeding" disabled={busy} onClick={() => runAction(() => apiRequest("/breastfeeding", { ...requestOptions, method: "POST", body: { date } }), "Breastfeeding time saved.")}>
            <span className="breastfeed-icon" aria-hidden="true">🤱</span><span>Breastfeed</span>
          </button>
        </div>
        <MilkAmountButtons token={auth.token} amounts={auth.milk_amounts || null} hideEditor disabled={busy} onAddEntry={handleAddEntry} />
        <form className="custom-entry-grid" onSubmit={(event) => { event.preventDefault(); handleAddEntry(customAmount, customNote); }}>
          <div className="entry-field"><label className="form-label" htmlFor="custom-amount">Milk amount (ml)</label>
          <input id="custom-amount" type="number" step="any" placeholder="Amount (ml)" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} className="form-control" disabled={busy} />
          </div><div className="entry-field"><label className="form-label" htmlFor="custom-note">Note (optional)</label>
          <input id="custom-note" type="text" placeholder="Note (optional)" value={customNote} onChange={(event) => setCustomNote(event.target.value)} className="form-control" disabled={busy} />
          </div><button className="btn btn-success" disabled={busy}>Add</button>
        </form>
        <div className="save-feedback" aria-live="polite">{isSaving ? "Saving…" : status}</div>
        {error && <div className="alert alert-danger mt-2 mb-0" role="alert">{error} <button className="btn btn-outline-dark btn-sm" type="button" disabled={isSaving} onClick={() => refreshLogs({ showLoading: !day })}>Refresh</button></div>}
      </section>

      <section className="soft-card full">
        <button className="btn btn-outline-dark" type="button" aria-expanded={detailsOpen} disabled={busy} onClick={openDetails}>{detailsOpen ? "Close goals & measurements" : "Goals & measurements"}</button>
        {detailsOpen && <div className="daily-details mt-3">
          <form onSubmit={(event) => { event.preventDefault(); runAction(() => apiRequest("/goals", { ...requestOptions, method: "POST", body: { date, goal: Number(goalDraft) } }), "Daily goal saved."); }}>
            <h3 className="h6">Daily milk goal</h3><p className="small text-muted">A goal you choose for {formatDate(date)}.</p>
            <label htmlFor="daily-goal" className="form-label">Goal (ml)</label>
            <input id="daily-goal" type="number" min="1" step="1" required className="form-control" value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} disabled={isSaving} />
            <button className="btn btn-outline-dark mt-2" disabled={isSaving}>Save goal</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); runAction(() => apiRequest("/measurements", { ...requestOptions, method: "POST", body: { date, weight: Number(weightDraft), height: Number(heightDraft) } }), "Measurements saved."); }}>
            <h3 className="h6">Measurements</h3>
            <label htmlFor="weight" className="form-label">Weight (kg)</label>
            <input id="weight" type="number" min="0.001" step="any" required className="form-control" value={weightDraft} onChange={(event) => setWeightDraft(event.target.value)} disabled={isSaving} />
            <label htmlFor="height" className="form-label mt-2">Height (cm)</label>
            <input id="height" type="number" min="0.001" step="any" required className="form-control" value={heightDraft} onChange={(event) => setHeightDraft(event.target.value)} disabled={isSaving} />
            <button className="btn btn-outline-dark mt-2" disabled={isSaving}>Save measurements</button>
          </form>
        </div>}
      </section>

      <section className="soft-card full">
        <div className="section-header"><h2 className="section-title">Logs</h2>
          <button className="btn btn-outline-dark btn-sm" type="button" disabled={busy} onClick={() => refreshLogs({ showLoading: !day })}>Refresh logs</button></div>
        {isLoading ? <div className="empty-state">Loading…</div> : !day ? <div className="empty-state">Reconnect to load records.</div> : !logs.length ? <div className="empty-state">No logs for this date yet.</div> : <ul className="log-list">
          {logs.map((log) => <li key={logKey(log)} className="log-item">
            <div className="log-main"><span className="log-title">{formatTime(log.created_at)} · {log.type}{log.type === "Milk" ? ` · ${log.amount} ml` : ""}</span>{log.notes && <small className="log-note">{log.notes}</small>}</div>
            {editingLog === logKey(log) ? <form className="log-edit-form" onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(editAmount);
              if (!Number.isFinite(amount) || (amount === 0 && !editNote.trim())) { setError("Enter an amount or note."); return; }
              runAction(async () => {
                await apiRequest(`/entries/${log.id}`, { ...requestOptions, method: "PUT", body: { amount, notes: editNote.trim() } });
                setEditingLog(null);
              }, "Milk entry updated.");
            }}>
              <label>Amount (ml)<input className="form-control" type="number" step="any" required value={editAmount} onChange={(event) => setEditAmount(event.target.value)} disabled={isSaving} /></label>
              <label>Note<input className="form-control" value={editNote} onChange={(event) => setEditNote(event.target.value)} disabled={isSaving} /></label>
              <div className="d-flex gap-2"><button className="btn btn-success" disabled={isSaving}>Save entry</button><button className="btn btn-outline-dark" type="button" disabled={isSaving} onClick={() => setEditingLog(null)}>Cancel edit</button></div>
            </form> : deleteLog === logKey(log) ? <div className="delete-confirmation">
              <p className="small mb-2">Delete this {log.type.toLowerCase()} record? This cannot be undone.</p>
              <div className="d-flex gap-2"><button className="btn btn-danger btn-sm" type="button" disabled={isSaving} onClick={() => runAction(async () => {
                await apiRequest(`/${log.endpoint}/${log.id}`, { ...requestOptions, method: "DELETE" }); setDeleteLog(null);
              }, "Record deleted.")}>Confirm delete</button>
              <button className="btn btn-outline-dark btn-sm" type="button" disabled={isSaving} onClick={() => setDeleteLog(null)}>Keep record</button></div>
            </div> : <div className="log-actions">
              {log.type === "Milk" && <button className="btn btn-outline-dark btn-sm" type="button" disabled={isSaving} aria-label={`Edit milk entry ${log.id}`} onClick={() => { setEditingLog(logKey(log)); setDeleteLog(null); setEditAmount(String(log.amount)); setEditNote(log.notes || ""); }}>Edit</button>}
              <button className="btn btn-outline-dark btn-sm" type="button" disabled={isSaving} aria-label={`Delete ${log.type.toLowerCase()} entry ${log.id}`} onClick={() => { setDeleteLog(logKey(log)); setEditingLog(null); }}>Delete</button>
            </div>}
          </li>)}
        </ul>}
      </section>
    </div>
  </section></main>;
}
