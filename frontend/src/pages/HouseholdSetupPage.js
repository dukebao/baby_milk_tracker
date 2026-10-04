import { useRef, useState } from "react";
import { apiRequest } from "../api";

export default function HouseholdSetupPage({ auth, household, baby, onComplete, onLogout }) {
  const [householdName, setHouseholdName] = useState(household.name === "My family" ? "" : household.name);
  const [babyName, setBabyName] = useState(baby.name === "Baby" ? "" : baby.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    if (!householdName.trim() || !babyName.trim()) { setError("Enter a household name and baby name."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const data = await apiRequest(`/households/${household.id}/setup`, {
        token: auth.token, method: "POST",
        body: { baby_id: baby.id, household_name: householdName.trim(), baby_name: babyName.trim() },
      });
      onComplete(data);
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <main className="app-page"><section className="hero-panel setup-page">
    <header className="page-header"><div className="kicker">Welcome to Milk Tracker</div>
      <h1 className="page-title">Let’s set up your family</h1>
      <p className="page-subtitle">Add your household and baby names before you start tracking. You can change them later in Settings.</p>
    </header>
    <form className="soft-card setup-form" onSubmit={submit}>
      <label className="form-label" htmlFor="setup-household">Household name</label>
      <input autoFocus id="setup-household" className="form-control" required maxLength={100} autoComplete="off" placeholder="e.g. The Chen family" value={householdName} disabled={busy} onChange={(event) => setHouseholdName(event.target.value)} />
      <label className="form-label mt-4" htmlFor="setup-baby">Baby name</label>
      <input id="setup-baby" className="form-control" required maxLength={100} autoComplete="off" placeholder="What should we call your baby?" value={babyName} disabled={busy} onChange={(event) => setBabyName(event.target.value)} />
      {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
      <button type="submit" className="btn btn-dark w-100 mt-4" disabled={busy || !householdName.trim() || !babyName.trim()}>{busy ? "Saving…" : "Save & start tracking"}</button>
      <button type="button" className="btn btn-outline-dark w-100 mt-3" disabled={busy} onClick={onLogout}>Log out</button>
    </form>
  </section></main>;
}
