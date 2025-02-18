import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

export default function BabyMilkTracker() {
  const { date } = useParams(); // Get the selected date from the URL
  const [goal, setGoal] = useState(800);
  const [logs, setLogs] = useState([]);
  const [percentage, setPercentage] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");

  // Load logs and goal from localStorage
  useEffect(() => {
    const storedLogs = JSON.parse(localStorage.getItem(`logs-${date}`)) || [];
    const storedGoal = JSON.parse(localStorage.getItem(`goal-${date}`)) || 800;
    setLogs(storedLogs);
    setGoal(storedGoal);
    calculatePercentage(storedLogs, storedGoal);
  }, [date]);

  // Calculate the percentage of the goal reached
  const calculatePercentage = (logs, goalValue) => {
    const total = logs.reduce((sum, entry) => sum + entry.amount, 0);
    setPercentage(((total / goalValue) * 100).toFixed(2));
  };

  // Function to update goal value & save to localStorage
  const handleGoalChange = (e) => {
    const newGoal = Number(e.target.value);
    setGoal(newGoal);
    localStorage.setItem(`goal-${date}`, JSON.stringify(newGoal));
    calculatePercentage(logs, newGoal);
  };

  // Function to add an entry
  const handleAddEntry = (amount, note = "") => {
    if (amount !== 0) {
      const newLog = {
        id: Date.now(),
        amount: Number(amount),
        time: new Date().toLocaleTimeString(),
        note: note.trim() || null,
      };

      const updatedLogs = [...logs, newLog];
      setLogs(updatedLogs);
      localStorage.setItem(`logs-${date}`, JSON.stringify(updatedLogs));
      calculatePercentage(updatedLogs, goal);
      setCustomAmount(""); // Clear input field
      setCustomNote(""); // Clear note field
    }
  };

  // Function to delete an entry
  const handleDeleteEntry = (id) => {
    const updatedLogs = logs.filter((log) => log.id !== id);
    setLogs(updatedLogs);
    localStorage.setItem(`logs-${date}`, JSON.stringify(updatedLogs));
    calculatePercentage(updatedLogs, goal);
  };

  return (
    <div className="container mt-4">
      <h1 className="fw-bold mb-3 text-center fs-4">Milk Tracker - {date}</h1>

      {/* Back to Calendar Button */}
      <div className="mb-3 text-center">
        <Link to="/" className="btn btn-outline-dark rounded-3 fs-6">← Back to Calendar</Link>
      </div>

      {/* Goal Input */}
      <div className="mb-4">
        <label className="form-label fs-5">Daily Goal (ml)</label>
        <input
          type="number"
          value={goal}
          onChange={handleGoalChange}
          className="form-control rounded-3 shadow-sm fs-5"
        />
      </div>

      {/* Add Entry */}
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body">
          <h2 className="h5 mb-3 fs-5">Add Entry</h2>
          <div className="row g-2">
            <div className="col-12 col-md-auto">
              <button className="btn btn-dark rounded-3 w-100 fs-6" onClick={() => handleAddEntry(80)}>80 ml</button>
            </div>
            <div className="col-12 col-md-auto">
              <button className="btn btn-dark rounded-3 w-100 fs-6" onClick={() => handleAddEntry(200)}>200 ml</button>
            </div>
            <div className="col-12 col-md-auto">
              <button className="btn btn-danger rounded-3 w-100 fs-6" onClick={() => handleAddEntry(-50)}>−50 ml (Puked) :(</button>
            </div>
            <div className="col-12">
              <input
                type="number"
                placeholder="Enter custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="form-control rounded-3 shadow-sm fs-6 mb-2"
              />
              <input
                type="text"
                placeholder="Add a note (optional)"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="form-control rounded-3 shadow-sm fs-6 mb-2"
              />
              <button className="btn btn-success w-100 rounded-3 fs-6" onClick={() => handleAddEntry(customAmount, customNote)}>Add</button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <h2 className="h5 fs-5">Progress</h2>
        <div className="progress mt-2 bg-light rounded-3 shadow-sm">
          <div
            className="progress-bar bg-dark"
            role="progressbar"
            style={{ width: `${percentage}%` }}
          >
            {percentage}%
          </div>
        </div>
        <p className="mt-2 text-muted fs-6">{percentage}% of daily goal reached</p>
      </div>

      {/* Logs */}
      <div className="mt-4">
        <h2 className="h5 fs-5">Logs</h2>
        <ul className="list-group mt-2 shadow-sm">
          {logs.map((log) => (
            <li key={log.id} className="list-group-item d-flex justify-content-between align-items-center border-0">
              <div>
                <span className="fs-6">{log.time} - {log.amount} ml</span>
                {log.note && <small className="d-block text-muted">{log.note}</small>}
              </div>
              <button className="btn btn-danger btn-sm rounded-3" onClick={() => handleDeleteEntry(log.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
