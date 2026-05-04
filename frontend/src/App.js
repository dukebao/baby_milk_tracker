import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";
import BabyMilkTracker from "./pages/BabyMilkTracker";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem("milk-tracker-auth");
    return stored ? JSON.parse(stored) : null;
  });
  const [selectedBabyId, setSelectedBabyId] = useState(() => localStorage.getItem("milk-tracker-baby-id") || "");

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

    apiRequest("/me", { token: auth.token })
      .then((data) => {
        setAuth((currentAuth) => {
          if (!currentAuth || currentAuth.token !== auth.token) {
            return currentAuth;
          }
          const nextAuth = { ...currentAuth, user: data.user, babies: data.babies };
          localStorage.setItem("milk-tracker-auth", JSON.stringify(nextAuth));
          return nextAuth;
        });
      })
      .catch(() => {
        setAuth(null);
        localStorage.removeItem("milk-tracker-auth");
        localStorage.removeItem("milk-tracker-baby-id");
      });
  }, [auth?.token]);

  useEffect(() => {
    if (selectedBaby?.id) {
      setSelectedBabyId(String(selectedBaby.id));
      localStorage.setItem("milk-tracker-baby-id", String(selectedBaby.id));
    }
  }, [selectedBaby?.id]);

  const handleLogin = (data) => {
    setAuth(data);
    localStorage.setItem("milk-tracker-auth", JSON.stringify(data));
    if (data.babies?.[0]?.id) {
      setSelectedBabyId(String(data.babies[0].id));
      localStorage.setItem("milk-tracker-baby-id", String(data.babies[0].id));
    }
  };

  const handleLogout = async () => {
    if (auth?.token) {
      await apiRequest("/auth/logout", { token: auth.token, method: "POST" }).catch(() => {});
    }
    setAuth(null);
    setSelectedBabyId("");
    localStorage.removeItem("milk-tracker-auth");
    localStorage.removeItem("milk-tracker-baby-id");
  };

  const handleBabiesChange = (babies, babyId) => {
    const nextAuth = { ...auth, babies };
    setAuth(nextAuth);
    localStorage.setItem("milk-tracker-auth", JSON.stringify(nextAuth));
    if (babyId) {
      setSelectedBabyId(String(babyId));
    }
  };

  if (!auth?.token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="app-shell">
        <Routes>
          <Route
            path="/"
            element={
              <CalendarPage
                auth={auth}
                selectedBaby={selectedBaby}
                selectedBabyId={selectedBabyId}
                onBabyChange={setSelectedBabyId}
                onBabiesChange={handleBabiesChange}
                onLogout={handleLogout}
              />
            }
          />
          <Route
            path="/milk_track/:date"
            element={<BabyMilkTracker auth={auth} selectedBaby={selectedBaby} onLogout={handleLogout} />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
