import { useEffect, useState } from "react";
import { apiRequest } from "../api";

export default function MilkAmountButtons({ token, onAddEntry, amounts: providedAmounts, onSaved, editorOnly = false, hideEditor = false, disabled = false }) {
  const [loadedAmounts, setAmounts] = useState(null);
  const amounts = providedAmounts === undefined ? loadedAmounts : providedAmounts;
  const [draft, setDraft] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (providedAmounts !== undefined) return;
    let active = true;
    setError("");
    apiRequest("/me/preferences", { token })
      .then((data) => { if (active) setAmounts(data.milk_amounts); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [token, loadAttempt, providedAmounts]);

  const saveAmounts = async (event) => {
    event.preventDefault();
    const nextAmounts = draft.map(Number);
    if (draft.some((value) => value.trim() === "") || nextAmounts.some((amount) => !Number.isFinite(amount) || amount === 0)) {
      setError("Enter a nonzero amount for each button.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const data = await apiRequest("/me/preferences", { token, method: "PUT", body: { milk_amounts: nextAmounts } });
      setAmounts(data.milk_amounts);
      onSaved?.(data.milk_amounts);
      setIsEditing(false);
      setStatus("Milk buttons saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="milk-presets mt-3">
      <div className="section-header">
        <h3 className="h6 mb-0">Milk buttons</h3>
        {!hideEditor && <button className="btn btn-outline-dark btn-sm" type="button" disabled={!amounts || isEditing} onClick={() => {
          setDraft(amounts.map(String));
          setError("");
          setStatus("");
          setIsEditing(true);
        }}>Edit amounts</button>}
      </div>
      {!editorOnly && <div className="milk-amount-actions">
        {amounts ? amounts.map((amount, index) => (
          <button key={index} className={`btn milk-preset-button ${amount < 0 ? "btn-danger" : "btn-dark"}`} type="button" disabled={disabled} onClick={() => onAddEntry(amount)}>
            <span aria-hidden="true">🍼</span><span>{amount} ml</span>
          </button>
        )) : <span role="status">{error ? "Milk buttons unavailable." : "Loading milk buttons..."}</span>}
      </div>}
      {editorOnly && <p className="small text-muted mb-0">{amounts ? amounts.map((amount) => `${amount} ml`).join(" · ") : "Reconnect to load milk amounts."}</p>}
      {isEditing && (
        <form className="mt-3" onSubmit={saveAmounts}>
          <p className="small text-muted" id="milk-amount-help">Choose your three amounts in ml. Use a negative amount to subtract milk. Saved to your account.</p>
          <div className="milk-amount-actions">
            {draft.map((amount, index) => (
              <label key={index} htmlFor={`milk-amount-${index}`}>
                Button {index + 1} (ml)
                <input id={`milk-amount-${index}`} className="form-control mt-1" type="number" step="any" required aria-describedby="milk-amount-help" value={amount} disabled={isSaving} onChange={(event) => {
                  setDraft(draft.map((value, position) => position === index ? event.target.value : value));
                }} />
              </label>
            ))}
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button className="btn btn-dark" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save amounts"}</button>
            <button className="btn btn-outline-dark" type="button" disabled={isSaving} onClick={() => { setIsEditing(false); setError(""); }}>Cancel</button>
            <button className="btn btn-outline-dark" type="button" disabled={isSaving} onClick={() => setDraft(["80", "200", "-50"])}>Restore defaults</button>
          </div>
        </form>
      )}
      {error && <div className="alert alert-danger mt-3 mb-0" role="alert">
        {error}
        {!amounts && <button className="btn btn-outline-dark btn-sm ms-2" type="button" onClick={() => setLoadAttempt(loadAttempt + 1)}>Retry</button>}
      </div>}
      {status && <p className="small mt-2 mb-0" role="status">{status}</p>}
    </div>
  );
}
