import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import BabyMilkTracker from "./pages/BabyMilkTracker";
import CalendarPage from "./pages/CalendarPage";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  return (
    <Router>
      <div className="container mt-4">
        <Routes>
          {/* Default Route - Show Calendar */}
          <Route path="/" element={<CalendarPage />} />

          {/* Tracker Page with Date */}
          <Route path="/milk_track/:date" element={<BabyMilkTracker />} />

          {/* Redirect any unknown route back to Calendar */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
