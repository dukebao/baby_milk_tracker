import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    // Set the default selected date to today
    const today = new Date().toISOString().split("T")[0];
    setSelectedDate(today);
  }, []);

  const handleSelectDate = (event) => {
    setSelectedDate(event.target.value);
  };

  const goToTracker = () => {
    if (selectedDate) {
      navigate(`/milk_track/${selectedDate}`);
    }
  };

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const today = new Date();
  const month = currentMonth.getMonth();
  const year = currentMonth.getFullYear();
  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);

  const calendarDays = [];

  // Fill empty slots before first day
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  // Fill actual days in the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(new Date(year, month, day).toISOString().split("T")[0]);
  }

  // Ensure the last row has exactly 7 days
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  // Split into rows of exactly 7 days
  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const changeMonth = (offset) => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
  };

  return (
    <div className="container mt-4">
      <h1 className="fw-bold mb-3 text-center">Aria's Milk Tracker</h1>

      {/* Date Picker */}
      <div className="mb-4">
        <input
          type="date"
          value={selectedDate}
          onChange={handleSelectDate}
          className="form-control rounded-3 shadow-sm fs-5"
        />
      </div>

      {/* Button to Navigate to Milk Tracker */}
      <button
        className="btn btn-dark w-100 rounded-3 fs-5 mb-4"
        onClick={goToTracker}
        disabled={!selectedDate}
      >
        Go to Tracker
      </button>

      {/* Calendar Controls */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-dark" onClick={() => changeMonth(-1)}>
          &lt;
        </button>
        <h2 className="h5 text-center m-0">
          {currentMonth.toLocaleString("default", { month: "long", year: "numeric" })}
        </h2>
        <button className="btn btn-outline-dark" onClick={() => changeMonth(1)}>
          &gt;
        </button>
      </div>

      {/* Calendar Display */}
      <div className="card shadow-sm p-3">
        {/* Weekday Headers */}
        <div className="row text-center fw-bold">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="col p-2">{day}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        {weeks.map((week, rowIndex) => (
          <div key={rowIndex} className="row text-center">
            {week.map((date, index) => (
              <div key={index} className="col p-1">
                {date ? (
                  <button
                    className={`btn ${date === today.toISOString().split("T")[0] ? "btn-primary" : "btn-outline-dark"} w-100`}
                    style={{ width: "40px", height: "40px", fontSize: "14px", padding: "0" }}
                    onClick={() => navigate(`/milk_track/${date}`)}
                  >
                    {parseInt(date.split("-")[2])} {/* Extract day */}
                  </button>
                ) : (
                  <div style={{ width: "40px", height: "40px" }}></div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
