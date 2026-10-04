import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api";
import { localDate, shiftDate } from "../dates";
import MilkAmountButtons from "./MilkAmountButtons";
import { appUrl } from "../appLocation";

function HouseholdSettings({ auth, selectedBaby, onBabiesChange, onHouseholdsChange }) {
  const household = auth.households?.find((item) => String(item.id) === String(selectedBaby?.household_id));
  const [name, setName] = useState(household?.name || "");
  const [babyName, setBabyName] = useState("");
  const [selectedBabyName, setSelectedBabyName] = useState(selectedBaby?.name || "");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState(null);
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [attempt, setAttempt] = useState(0);
  const linkInput = useRef(null);
  const householdId = selectedBaby?.household_id;
  useEffect(() => { setSelectedBabyName(selectedBaby?.name || ""); }, [selectedBaby?.id, selectedBaby?.name]);
  useEffect(() => {
    if (!householdId) return;
    const controller = new AbortController();
    setError("");
    apiRequest(`/households/${householdId}/members`, { token: auth.token, signal: controller.signal })
      .then((data) => setMembers(data.members))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [auth.token, householdId, attempt]);
  const isOwner = members?.some((member) => member.user_id === auth.user?.id && member.role === "owner");
  const run = async (event, action) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(invite.url);
      else { linkInput.current.select(); if (!document.execCommand("copy")) throw new Error(); }
      setStatus("Invite link copied.");
    } catch { linkInput.current?.select(); setStatus("Select the link and copy it manually."); }
  };
  if (!householdId) return <p>Choose a baby to manage your household.</p>;
  return <section className="settings-section">
    <h3>Household</h3>
    <form onSubmit={(event) => run(event, async () => {
      const data = await apiRequest(`/households/${householdId}`, { token: auth.token, method: "PUT", body: { name } });
      onHouseholdsChange((auth.households || []).map((item) => item.id === data.household.id ? data.household : item));
      setStatus("Household name saved.");
    })}>
      <label className="form-label" htmlFor="household-name">Household name</label>
      <div className="compact-form-row"><input id="household-name" className="form-control" required value={name} onChange={(event) => setName(event.target.value)} disabled={busy || !isOwner} />
        <button className="btn btn-outline-dark" disabled={busy || !isOwner || !name.trim()}>Save name</button></div>
    </form>
    <h4 className="h6 mt-3">Members <span className="settings-info-label">View only</span></h4>
    {members ? <ul className="member-list">{members.map((member) => <li key={member.user_id}><span>{member.email}{member.user_id === auth.user?.id ? " (you)" : ""}</span><span className="role-badge">{member.role}</span></li>)}</ul> : <p className="small">Loading members…</p>}
    {isOwner && <>
      <form className="mt-3" onSubmit={(event) => run(event, async () => {
        const data = await apiRequest(`/babies/${selectedBaby.id}`, { token: auth.token, method: "PUT", body: { name: selectedBabyName } });
        onBabiesChange((auth.babies || []).map((baby) => baby.id === data.baby.id ? data.baby : baby), data.baby.id);
        setStatus("Baby name saved.");
      })}>
        <label className="form-label" htmlFor="selected-baby-name">Baby name</label>
        <div className="compact-form-row"><input id="selected-baby-name" className="form-control" required maxLength={100} value={selectedBabyName} onChange={(event) => setSelectedBabyName(event.target.value)} disabled={busy} />
          <button className="btn btn-outline-dark" disabled={busy || !selectedBabyName.trim()}>Save baby name</button></div>
      </form>
      <form className="mt-3" onSubmit={(event) => run(event, async () => {
        const data = await apiRequest("/babies", { token: auth.token, method: "POST", body: { name: babyName, household_id: householdId } });
        onBabiesChange([...(auth.babies || []), data.baby], data.baby.id);
        setBabyName(""); setStatus("Baby added.");
      })}>
        <label className="form-label" htmlFor="new-baby-name">Add baby</label>
        <div className="compact-form-row"><input id="new-baby-name" className="form-control" required value={babyName} onChange={(event) => setBabyName(event.target.value)} disabled={busy} placeholder="Baby name" />
          <button className="btn btn-success" disabled={busy || !babyName.trim()}>Add baby</button></div>
      </form>
      <form className="mt-3" onSubmit={(event) => run(event, async () => {
        const data = await apiRequest(`/households/${householdId}/invites`, { token: auth.token, method: "POST", body: { invited_email: email } });
        setInvite({ url: appUrl(data.join_path), expires_at: data.expires_at });
        setEmail(""); setStatus("Invite link created.");
      })}>
        <label className="form-label" htmlFor="invite-email">Invite caregiver</label>
        <input id="invite-email" className="form-control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} placeholder="Email (optional)" />
        <button className="btn btn-outline-dark mt-2" disabled={busy}>Create invite link</button>
      </form>
      {invite && <div className="mt-3"><label htmlFor="invite-link" className="form-label">Single-use invite link</label>
        <input id="invite-link" ref={linkInput} className="form-control" value={invite.url} readOnly onFocus={(event) => event.target.select()} />
        <p className="small mt-2">Expires {new Date(invite.expires_at).toLocaleDateString()}. Opens on your current app address.</p>
        <button type="button" className="btn btn-outline-dark" onClick={copyLink}>Copy link</button></div>}
    </>}
    {members && !isOwner && <p className="small text-muted">Household owners can name babies, add babies, and invite caregivers.</p>}
    {error && <div className="alert alert-danger mt-3" role="alert">{error} {!members && <button className="btn btn-outline-dark btn-sm" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>}</div>}
    {status && <p className="small mt-2" role="status">{status}</p>}
  </section>;
}

function ExportSettings({ auth, selectedBaby }) {
  const [start, setStart] = useState(shiftDate(localDate(), -29));
  const [end, setEnd] = useState(localDate());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const download = async (format, all = false) => {
    if (lock.current) return;
    if (!all && (!start || !end || start > end)) { setError("Choose a start date before the end date."); return; }
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams({ format });
      if (!all) { query.set("start_date", start); query.set("end_date", end); }
      const blob = await apiRequest(`/exports?${query}`, { token: auth.token, babyId: selectedBaby.id, download: true });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `baby-${selectedBaby.id}-${all ? "all-records" : `${start}-to-${end}`}.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Download started. Keep a copy somewhere safe.");
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="settings-section"><h3>Export & backup</h3>
    <p className="small">Download {selectedBaby?.name || "your baby's"} milk, breastfeeding, diaper, goal, and measurement records.</p>
    <div className="settings-date-range"><label>From<input className="form-control mt-1" type="date" value={start} onChange={(event) => setStart(event.target.value)} disabled={busy} /></label>
      <label>To<input className="form-control mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} disabled={busy} /></label></div>
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button className="btn btn-outline-dark" type="button" disabled={busy || !selectedBaby} onClick={() => download("csv")}>Export CSV</button>
      <button className="btn btn-outline-dark" type="button" disabled={busy || !selectedBaby} onClick={() => download("json")}>Export JSON</button>
      <button className="btn btn-dark" type="button" disabled={busy || !selectedBaby} onClick={() => download("json", true)}>Back up all records</button></div>
    {busy && <p className="small mt-2" role="status">Preparing download…</p>}
    {message && <p className="small mt-2" role="status">{message}</p>}
    {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
  </section>;
}

export default function SettingsPanel({ auth, selectedBaby, selectedBabyId, onBabyChange, onClose, onMilkAmountsChange, onBabiesChange, onHouseholdsChange, onLogout, theme, onThemeChange }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal(); element.querySelector("button")?.focus(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-drawer"><header className="settings-header"><div><p className="kicker mb-2">Your preferences</p><h2 id="settings-title">Settings</h2></div>
      <button type="button" className="btn btn-outline-dark" onClick={onClose}>Close</button></header>
      <div className="settings-body">
        <section className="settings-section">
          <h3>Appearance</h3>
          <label className="appearance-switch" htmlFor="dark-mode-toggle">
            <span><strong>Dark mode</strong><small>Saved on this device.</small></span>
            <input id="dark-mode-toggle" type="checkbox" role="switch" checked={theme === "dark"} onChange={(event) => onThemeChange(event.target.checked ? "dark" : "light")} />
          </label>
        </section>
        <section className="settings-section"><label htmlFor="settings-baby" className="form-label">Selected baby</label>
          <select id="settings-baby" className="form-select" value={selectedBabyId || selectedBaby?.id || ""} onChange={(event) => onBabyChange(event.target.value)}>
            {(auth.babies || []).map((baby) => <option key={baby.id} value={baby.id}>{baby.name}</option>)}</select></section>
        <section className="settings-section"><MilkAmountButtons token={auth.token} amounts={auth.milk_amounts || null} onSaved={onMilkAmountsChange} editorOnly /></section>
        <HouseholdSettings key={`household-${selectedBaby?.household_id}`} {...{ auth, selectedBaby, onBabiesChange, onHouseholdsChange }} />
        <ExportSettings key={`export-${selectedBaby?.id}`} {...{ auth, selectedBaby }} />
        <section className="settings-section"><h3>Account</h3><p className="settings-account-info">Signed in as<br /><strong>{auth.user?.email}</strong></p><button className="btn btn-outline-dark" type="button" onClick={onLogout}>Log out</button></section>
      </div></div>
  </dialog>;
}
