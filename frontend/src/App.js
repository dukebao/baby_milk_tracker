import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";
import { restoreSession, watchSession } from "./supabase";
import { appBasePath, isInviteLocation } from "./appLocation";
import BabyMilkTracker from "./pages/BabyMilkTracker";
import CalendarPage from "./pages/CalendarPage";
import JoinInvitePage from "./pages/JoinInvitePage";
import LoginPage from "./pages/LoginPage";
import SettingsPanel from "./pages/SettingsPanel";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import HouseholdSetupPage from "./pages/HouseholdSetupPage";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import "./DarkMode.css";
import "./Controls.css";

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("milk-tracker-theme") === "dark" ? "dark" : "light");
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bsTheme = theme;
    localStorage.setItem("milk-tracker-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#171b24" : "#fff8ef");
  }, [theme]);
  const [auth, setAuth] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  useEffect(() => {
    let active = true;
    let sawAuthEvent = false;
    localStorage.removeItem("milk-tracker-auth");
    const applySession = (session) => {
      if (!active) return;
      setAuth((current) => session ? { ...(current?.user?.id === session.user.id ? current : {}),
        token: session.access_token, user: { id: session.user.id, email: session.user.email } } : null);
      setSessionLoading(false);
    };
    const unsubscribe = watchSession((session, event) => {
      sawAuthEvent = true;
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      if (!session) { setIsSettingsOpen(false); setRecoveringPassword(false); }
      applySession(session);
    });
    restoreSession().then((session) => { if (!sawAuthEvent) applySession(session); }).catch(() => { if (active) setSessionLoading(false); });
    return () => { active = false; unsubscribe(); };
  }, []);
  const [selectedBabyId, setSelectedBabyId] = useState(() => localStorage.getItem("milk-tracker-baby-id") || "");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [refreshAttempt, setRefreshAttempt] = useState(0);

  const selectedBaby = useMemo(() => {
    if (!auth?.babies?.length) {
      return null;
    }
    return auth.babies.find((baby) => String(baby.id) === String(selectedBabyId)) || auth.babies[0];
  }, [auth, selectedBabyId]);

  useEffect(() => {
    if (!auth?.token) {
      return;
    }

    const controller = new AbortController();
    setConnectionError("");
    apiRequest("/me", { token: auth.token, signal: controller.signal })
      .then((data) => {
        setAuth((currentAuth) => {
          if (!currentAuth || currentAuth.token !== auth.token) {
            return currentAuth;
          }
          const nextAuth = { ...currentAuth, ...data };
          return nextAuth;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err.status === 401) {
          setAuth(null);
          setIsSettingsOpen(false);
          localStorage.removeItem("milk-tracker-auth");
          localStorage.removeItem("milk-tracker-baby-id");
        } else {
          setConnectionError(err.message);
        }
      });
    return () => controller.abort();
  }, [auth?.token, refreshAttempt]);

  useEffect(() => {
    if (selectedBaby?.id) {
      setSelectedBabyId(String(selectedBaby.id));
      localStorage.setItem("milk-tracker-baby-id", String(selectedBaby.id));
    }
  }, [selectedBaby?.id]);

  const applyAuthData = (data, babyId) => {
    const nextAuth = { ...auth, ...data };
    setAuth(nextAuth);
    const joinedBaby = data.accepted_household_id
      ? data.babies?.find((baby) => String(baby.household_id) === String(data.accepted_household_id))
      : null;
    const nextBabyId = babyId || joinedBaby?.id || data.babies?.[0]?.id;
    if (nextBabyId) {
      setSelectedBabyId(String(nextBabyId));
      localStorage.setItem("milk-tracker-baby-id", String(nextBabyId));
    }
  };

  const handleLogin = (data) => {
    setConnectionError("");
    setAuth(data);
    if (data.babies?.[0]?.id) {
      setSelectedBabyId(String(data.babies[0].id));
      localStorage.setItem("milk-tracker-baby-id", String(data.babies[0].id));
    }
  };

  const handleLogout = async () => {
    if (auth?.token) {
      try { await apiRequest("/auth/logout", { token: auth.token, method: "POST" }); }
      catch (err) { setConnectionError(`Unable to sign out: ${err.message}`); return; }
    }
    setAuth(null);
    setIsSettingsOpen(false);
    setConnectionError("");
    setSelectedBabyId("");
    localStorage.removeItem("milk-tracker-auth");
    localStorage.removeItem("milk-tracker-baby-id");
  };

  const handleBabiesChange = (babies, babyId) => {
    setAuth((current) => {
      if (!current) return current;
      const nextAuth = { ...current, babies };
      return nextAuth;
    });
    if (babyId) {
      setSelectedBabyId(String(babyId));
    }
  };

  const handleHouseholdsChange = (households) => {
    setAuth((current) => {
      if (!current) return current;
      const nextAuth = { ...current, households };
      return nextAuth;
    });
  };

  const handleMilkAmountsChange = (milk_amounts) => {
    setAuth((current) => {
      if (!current) return current;
      const next = { ...current, milk_amounts };
      return next;
    });
  };

  const pageProps = {
    auth, selectedBaby, selectedBabyId, onBabyChange: setSelectedBabyId,
    onOpenSettings: () => setIsSettingsOpen(true),
  };

  if (sessionLoading) return <main className="app-page"><p role="status">Restoring your session…</p></main>;
  if (recoveringPassword && auth?.token) return <ResetPasswordPage onDone={() => setRecoveringPassword(false)} />;

  const setupHousehold = auth?.households?.find((household) => household.id === selectedBaby?.household_id && household.created_by === auth.user?.id
    && (household.setup_completed === false || (household.setup_completed === undefined
      && household.name === "My family" && auth.babies?.some((baby) => baby.household_id === household.id && baby.name === "Baby"))));
  const setupBaby = auth?.babies?.find((baby) => baby.household_id === setupHousehold?.id);
  // Invitations open first so new caregivers can join their existing family.
  if (setupHousehold && setupBaby && !isInviteLocation()) {
    return <HouseholdSetupPage key={setupHousehold.id} auth={auth} household={setupHousehold} baby={setupBaby} onLogout={handleLogout} onComplete={({ household, baby }) => {
      setAuth((current) => current?.user?.id !== auth.user?.id ? current : ({ ...current,
        households: current.households.map((item) => item.id === household.id ? household : item),
        babies: current.babies.map((item) => item.id === baby.id ? baby : item),
      }));
      setSelectedBabyId(String(baby.id));
      setRefreshAttempt((value) => value + 1);
    }} />;
  }

  return (
    <Router basename={appBasePath || "/"}>
      <div className="app-shell">
        {connectionError && auth?.token && <div className="alert alert-warning connection-banner" role="alert">
          {connectionError} Your login is saved.
          <button type="button" className="btn btn-outline-dark btn-sm ms-2" onClick={() => setRefreshAttempt((value) => value + 1)}>Retry connection</button>
        </div>}
        <Routes>
          <Route
            path="/"
            element={auth?.token ? (
              <CalendarPage
                {...pageProps}
              />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )}
          />
          <Route
            path="/milk_track/:date"
            element={
              auth?.token ? (
                <BabyMilkTracker key={`${selectedBaby?.id}-${auth.user?.id}`} {...pageProps} />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/join/:token"
            element={
              auth?.token ? (
                <JoinInvitePage auth={auth} onAuthUpdate={applyAuthData} />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        {auth?.token && isSettingsOpen && <SettingsPanel
          {...pageProps} onClose={() => setIsSettingsOpen(false)}
          theme={theme} onThemeChange={setTheme}
          onBabiesChange={handleBabiesChange} onHouseholdsChange={handleHouseholdsChange}
          onMilkAmountsChange={handleMilkAmountsChange} onLogout={handleLogout}
        />}
      </div>
    </Router>
  );
}

export default App;
