import { useState } from "react";
import { apiRequest } from "../api";

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [babyName, setBabyName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegistering = mode === "register";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await apiRequest(isRegistering ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: isRegistering ? { email, password, baby_name: babyName } : { email, password },
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="app-page auth-page">
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

              <label className="form-label mt-3">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="form-control"
                autoComplete="email"
                required
              />

              <label className="form-label mt-3">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="form-control"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                minLength="6"
                required
              />

              {isRegistering && (
                <>
                  <label className="form-label mt-3">Baby name</label>
                  <input
                    type="text"
                    value={babyName}
                    onChange={(event) => setBabyName(event.target.value)}
                    className="form-control"
                    placeholder="Baby"
                  />
                </>
              )}

              {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

              <button type="submit" className="btn btn-dark w-100 mt-4" disabled={isSubmitting}>
                {isSubmitting ? "Please wait..." : isRegistering ? "Create Account" : "Login"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
