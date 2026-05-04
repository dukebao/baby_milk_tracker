import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

export default function CalendarPage({
  auth,
  selectedBaby,
  selectedBabyId,
  onBabyChange,
  onBabiesChange,
  onLogout,
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newBabyName, setNewBabyName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const pstNow = new Date(
      Date.parse(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    );
    setSelectedDate(pstNow.toISOString().split("T")[0]);
  }, []);

  const goToTracker = () => {
    if (selectedDate && selectedBaby) {
      navigate(`/milk_track/${selectedDate}`);
    }
  };

  const handleAddBaby = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const data = await apiRequest("/babies", {
        token: auth.token,
        method: "POST",
        body: { name: newBabyName },
      });
      const babies = [...(auth.babies || []), data.baby];
      onBabiesChange(babies, data.baby.id);
      setNewBabyName("");
    } catch (err) {
      setError(err.message);
    }
  };

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const pstNow = new Date(
    Date.parse(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
  );
  const today = pstNow.toISOString().split("T")[0];

  const month = currentMonth.getMonth();
  const year = currentMonth.getFullYear();
  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);

  const calendarDays = [];

  for (let index = 0; index < firstDay; index += 1) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const pstDate = new Date(
      Date.parse(new Date(year, month, day).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    )
      .toISOString()
      .split("T")[0];
    calendarDays.push(pstDate);
  }

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  const weeks = [];
  for (let index = 0; index < calendarDays.length; index += 7) {
    weeks.push(calendarDays.slice(index, index + 7));
  }

  const changeMonth = (offset) => {
    setCurrentMonth((previous) => {
      const nextDate = new Date(previous);
      nextDate.setMonth(nextDate.getMonth() + offset);
      return nextDate;
    });
  };

  return (
    <main className="app-page">
      <section className="hero-panel">
        <header className="page-header">
          <div className="top-bar">
            <select
              className="form-control baby-select"
              value={selectedBabyId || selectedBaby?.id || ""}
              onChange={(event) => onBabyChange(event.target.value)}
            >
              {(auth.babies || []).map((baby) => (
                <option key={baby.id} value={baby.id}>
                  {baby.name}
                </option>
              ))}
            </select>
            <button className="btn btn-outline-dark" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>

          <div className="kicker">{selectedBaby?.name || "Baby"}</div>
          <h1 className="page-title">Milk Tracker</h1>
          <p className="page-subtitle">Daily feeding and diaper notes for your family.</p>
        </header>

        <div className="content-grid">
          <section className="soft-card date-picker-card">
            <h2 className="section-title">Open Date</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="form-control"
            />
            <button className="btn btn-dark w-100 mt-3" type="button" onClick={goToTracker} disabled={!selectedDate}>
              Go to Tracker
            </button>
          </section>

          <form className="soft-card" onSubmit={handleAddBaby}>
            <h2 className="section-title">Add Baby</h2>
            <input
              type="text"
              value={newBabyName}
              onChange={(event) => setNewBabyName(event.target.value)}
              className="form-control"
              placeholder="Name"
            />
            {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
            <button className="btn btn-success w-100 mt-3" type="submit">
              Add
            </button>
          </form>

          <section className="soft-card calendar-card">
            <div className="calendar-toolbar">
              <button className="btn btn-outline-dark" type="button" onClick={() => changeMonth(-1)}>
                &lt;
              </button>
              <h2 className="calendar-month">
                {currentMonth.toLocaleString("default", { month: "long", year: "numeric" })}
              </h2>
              <button className="btn btn-outline-dark" type="button" onClick={() => changeMonth(1)}>
                &gt;
              </button>
            </div>

            <div className="calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {weeks.map((week, rowIndex) => (
              <div key={rowIndex} className="calendar-row">
                {week.map((date, index) => (
                  <div key={`${date || "empty"}-${index}`} className="calendar-day-wrap">
                    {date ? (
                      <button
                        className={`btn calendar-day ${date === today ? "btn-primary" : "btn-outline-dark"}`}
                        type="button"
                        onClick={() => navigate(`/milk_track/${date}`)}
                      >
                        {parseInt(date.split("-")[2], 10)}
                      </button>
                    ) : (
                      <div className="calendar-empty" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
