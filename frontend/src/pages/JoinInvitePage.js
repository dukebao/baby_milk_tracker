import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../api";

export default function JoinInvitePage({ auth, onAuthUpdate }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    apiRequest(`/invites/${token}`)
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  const acceptInvite = async () => {
    setError("");
    setIsAccepting(true);

    try {
      const data = await apiRequest(`/invites/${token}/accept`, {
        token: auth.token,
        method: "POST",
      });
      onAuthUpdate(data);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <main className="app-page">
      <section className="hero-panel">
        <header className="page-header">
          <div className="kicker">Household Invite</div>
          <h1 className="page-title">{invite?.household?.name || "Join Household"}</h1>
          <p className="page-subtitle">Accept this invite to track the same baby logs together.</p>
        </header>

        <div className="content-grid">
          <section className="soft-card full auth-card">
            {invite?.used_at ? (
              <div className="empty-state">This invite has already been used.</div>
            ) : invite && new Date(invite.expires_at) < new Date() ? (
              <div className="empty-state">This invite has expired. Ask your household owner for a new link.</div>
            ) : (
              <button className="btn btn-dark w-100" type="button" onClick={acceptInvite} disabled={isAccepting || !invite}>
                {isAccepting ? "Joining..." : "Join Household"}
              </button>
            )}

            {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

            <Link to="/" className="btn btn-outline-dark w-100 mt-3">
              Back
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
