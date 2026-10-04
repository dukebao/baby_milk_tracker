import { useState } from "react";
import { apiRequest } from "../api";
import { googleEnabled } from "../supabase";

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegistering = mode === "register";
  const isResetting = mode === "reset";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      if (isResetting) {
        await apiRequest("/auth/reset", { method: "POST", body: { email } });
        setMessage("If an account exists for this email, you'll receive a password reset link.");
        return;
      }
      const data = await apiRequest(isRegistering ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (data.confirmation_required) setMessage("Check your email to confirm your account, then sign in.");
      else onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="app-page auth-page interactive-page">
        <section className="hero-panel">
          <div className="page-header">
            <div className="kicker">Private family tracker</div>
            <h1 className="page-title">Milk Tracker</h1>
            <p className="page-subtitle">Sign in to keep each baby's logs separate.</p>
          </div>

          <div className="content-grid">
            <form className="soft-card full auth-card" onSubmit={handleSubmit}>
              <div className="auth-tabs" role="tablist" aria-label="Login mode">
                <button
                  type="button"
                  className={`btn ${!isRegistering ? "btn-dark" : "btn-outline-dark"}`}
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`btn ${isRegistering ? "btn-dark" : "btn-outline-dark"}`}
                  onClick={() => setMode("register")}
                >
                  Register
                </button>
              </div>

              <label className="form-label mt-3" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="form-control"
                autoComplete="email"
                required
              />

              {!isResetting && <><label className="form-label mt-3" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="form-control"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                minLength="6"
                required
              /></>}

              {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
              {message && <p className="mt-3" role="status">{message}</p>}

              <button type="submit" className="btn btn-dark w-100 mt-4" disabled={isSubmitting}>
                {isSubmitting ? "Please wait..." : isResetting ? "Send reset link" : isRegistering ? "Create Account" : "Login"}
              </button>
              {!isResetting && <button type="button" className="btn btn-link w-100 mt-2" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>}
              {googleEnabled && <button type="button" className="btn btn-outline-dark w-100 mt-3" disabled={isSubmitting} onClick={async () => {
                setError(""); setIsSubmitting(true);
                try { await apiRequest("/auth/google", { method: "POST" }); }
                catch (err) { setError(err.message); setIsSubmitting(false); }
              }}>Continue with Google</button>}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
