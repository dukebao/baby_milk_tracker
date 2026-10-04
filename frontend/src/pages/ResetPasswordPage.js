import { useState } from "react";
import { apiRequest } from "../api";
export default function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="app-page"><section className="hero-panel"><h1 className="page-title">Set a new password</h1>
    <form className="soft-card auth-card" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try { await apiRequest("/auth/password", { method: "POST", body: { password } }); onDone(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>
      <label htmlFor="new-password" className="form-label">New password</label>
      <input id="new-password" type="password" className="form-control" required minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error && <p role="alert" className="alert alert-danger mt-3">{error}</p>}
      <button className="btn btn-dark mt-3" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </section></main>;
}
