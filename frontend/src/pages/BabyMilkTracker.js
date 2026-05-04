import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { apiRequest } from "../api";

export default function BabyMilkTracker({ auth, selectedBaby, onLogout }) {
  const { date } = useParams();
  const [logs, setLogs] = useState([]);
  const [peeLogs, setPeeLogs] = useState([]);
  const [poopLogs, setPoopLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const requestOptions = useMemo(
    () => ({
      token: auth.token,
      babyId: selectedBaby?.id,
    }),
    [auth.token, selectedBaby?.id]
  );

  const refreshLogs = useCallback(async () => {
    if (!selectedBaby?.id) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const [milk, pee, poop] = await Promise.all([
        apiRequest(`/entries/${date}`, requestOptions),
        apiRequest(`/pee/${date}`, requestOptions),
        apiRequest(`/poop/${date}`, requestOptions),
      ]);

      const milkLogs = (milk.entries || []).map((log) => ({ ...log, type: "Milk" }));
      const nextPeeLogs = pee.logs || [];
      const nextPoopLogs = poop.logs || [];
      const allLogs = [
        ...milkLogs,
        ...nextPeeLogs.map((log) => ({ ...log, type: "Pee" })),
        ...nextPoopLogs.map((log) => ({ ...log, type: "Poop" })),
      ].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

      setLogs(allLogs);
      setPeeLogs(nextPeeLogs);
      setPoopLogs(nextPoopLogs);
      setTotal(milkLogs.reduce((sum, entry) => sum + entry.amount, 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [date, requestOptions, selectedBaby?.id]);

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshLogs();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshLogs]);

  if (!selectedBaby) {
    return <Navigate to="/" />;
  }

  const runAction = async (action) => {
    setError("");
    try {
      await action();
      await refreshLogs();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddEntry = (amount, note = "") => {
    const parsedAmount = amount === "" || Number.isNaN(Number(amount)) ? 0 : parseFloat(amount);
    if (parsedAmount === 0 && note.trim() === "") {
      setError("Entry must have an amount or a note.");
      return;
    }

    runAction(async () => {
      await apiRequest("/entries", {
        ...requestOptions,
        method: "POST",
        body: {
          date,
          amount: parsedAmount,
          notes: note.trim(),
        },
      });
      setCustomAmount("");
      setCustomNote("");
    });
  };

  const handleDeleteEntry = (id, type) => {
    let endpoint = "/entries";
    if (type === "Pee") endpoint = "/pee";
    if (type === "Poop") endpoint = "/poop";

    runAction(() => apiRequest(`${endpoint}/${id}`, { ...requestOptions, method: "DELETE" }));
  };

  const handleAddPee = () => {
    runAction(() => apiRequest("/pee", { ...requestOptions, method: "POST", body: { date } }));
  };

  const handleAddPoop = () => {
    runAction(() => apiRequest("/poop", { ...requestOptions, method: "POST", body: { date } }));
  };

  const formatTime = (timestamp) => {
    const dateObj = new Date(timestamp);
    return dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="app-page">
      <section className="hero-panel">
        <header className="tracker-header">
          <div className="top-bar">
            <Link to="/" className="btn btn-outline-dark">
              Back
            </Link>
            <button className="btn btn-outline-dark" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
          <div className="kicker">{selectedBaby.name}</div>
          <h1 className="page-title">Milk Tracker</h1>
          <p className="page-subtitle">{date}</p>
        </header>

        <div className="content-grid">
          <section className="soft-card full">
            <h2 className="section-title">Score</h2>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{total} ml</div>
                <div className="stat-label">Milk</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{peeLogs.length}</div>
                <div className="stat-label">Pee</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{poopLogs.length}</div>
                <div className="stat-label">Poop</div>
              </div>
            </div>
          </section>

          <section className="soft-card full">
            <h2 className="section-title">Add Entry</h2>
            <div className="quick-actions">
              <button className="btn btn-warning" type="button" onClick={handleAddPee}>
                Pee
              </button>
              <button className="btn btn-secondary" type="button" onClick={handleAddPoop}>
                Poop
              </button>
              <button className="btn btn-dark" type="button" onClick={() => handleAddEntry(80)}>
                80 ml
              </button>
              <button className="btn btn-dark" type="button" onClick={() => handleAddEntry(200)}>
                200 ml
              </button>
              <button className="btn btn-danger" type="button" onClick={() => handleAddEntry(-50)}>
                -50 ml
              </button>
            </div>

            <div className="custom-entry-grid">
              <input
                type="number"
                placeholder="Amount"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                className="form-control"
              />
              <input
                type="text"
                placeholder="Note"
                value={customNote}
                onChange={(event) => setCustomNote(event.target.value)}
                className="form-control"
              />
              <button className="btn btn-success" type="button" onClick={() => handleAddEntry(customAmount, customNote)}>
                Add
              </button>
            </div>

            {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
          </section>

          <section className="soft-card full">
            <div className="section-header">
              <h2 className="section-title">Logs</h2>
              <button className="btn btn-outline-dark btn-sm" type="button" onClick={refreshLogs}>
                Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="empty-state">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="empty-state">No logs yet.</div>
            ) : (
              <ul className="log-list">
                {logs.map((log) => (
                  <li key={`${log.type}-${log.id}`} className="log-item">
                    <div className="log-main">
                      <span className="log-title">
                        {formatTime(log.created_at || log.date)} - {log.type}
                        {log.amount ? ` ${log.amount} ml` : ""}
                      </span>
                      {log.notes && <small className="log-note">{log.notes}</small>}
                    </div>
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDeleteEntry(log.id, log.type)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
