import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

export default function BabyMilkTracker() {
  const { date } = useParams(); // Get selected date from URL
  const [goal, setGoal] = useState(800);
  const [logs, setLogs] = useState([]);
  const [percentage, setPercentage] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");

  const API_URL = "http://localhost:8000"; // Adjust if using Docker

  // **Fetch logs from FastAPI**
  useEffect(() => {
    fetch(`${API_URL}/entries/${date}`)
      .then((res) => res.json())
      .then((data) => {
        setLogs(data.entries || []);
        calculatePercentage(data.entries || [], goal);
      })
      .catch((error) => console.error("Error fetching logs:", error));
  }, [date]);

  // **Connect to WebSocket for real-time updates**
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8000/ws");

    socket.onopen = () => {
      console.log("WebSocket Connected");
    };

    socket.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };

    socket.onmessage = (event) => {
      console.log("WebSocket update:", event.data);
      fetch(`${API_URL}/entries/${date}`)
        .then((res) => res.json())
        .then((data) => {
          setLogs(data.entries || []);
          calculatePercentage(data.entries || [], goal);
        });
    };

    return () => socket.close();
  }, [date]);

  // **Calculate percentage of goal reached**
  const calculatePercentage = (logs, goalValue) => {
    const total = logs.reduce((sum, entry) => sum + entry.amount, 0);
    setPercentage(((total / goalValue) * 100).toFixed(2));
  };

  // **Handle goal change**
  const handleGoalChange = (e) => {
    const newGoal = Number(e.target.value);
    setGoal(newGoal);
    calculatePercentage(logs, newGoal);
  };

  const handleAddEntry = (amount, note = "") => {
    // Ensure amount is a valid number, default to 0 if empty
    const parsedAmount = amount === "" || isNaN(amount) ? 0 : parseFloat(amount);

    // If both amount and note are empty, prevent submission
    if (parsedAmount === 0 && note.trim() === "") {
      console.warn("⚠️ Entry must have either an amount or a note.");
      return;
    }

    fetch(`${API_URL}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: date,  // Ensure date is in "YYYY-MM-DD" format
        amount: parsedAmount, // Convert to number, default 0 if empty
        notes: note.trim(), // Keep only non-empty notes
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json();
          console.error("❌ POST Request Failed:", errorData);
          return;
        }
        return res.json();
      })
      .then((data) => {
        console.log("✅ Entry added successfully:", data);
        setCustomAmount(""); // Clear input field
        setCustomNote(""); // Clear note field
      })
      .catch((error) => console.error("❌ Error adding entry:", error));
  };




  // **Delete an entry (DELETE)**
  const handleDeleteEntry = (id) => {
    fetch(`${API_URL}/entries/${id}`, { method: "DELETE" })
      .then((res) => res.json())
      .catch((error) => console.error("Error deleting entry:", error));
  };

  return (
    <div className="container mt-4">
      <h1 className="fw-bold mb-3 text-center fs-4">Milk Tracker - {date}</h1>

      {/* Back to Calendar */}
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
              <button className="btn btn-danger rounded-3 w-100 fs-6" onClick={() => handleAddEntry(-50)}>−50 ml (Puked)</button>
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

      {/* Progress Bar */}
      <div className="mt-4">
        <h2 className="h5 fs-5">Progress</h2>
        <div className="progress mt-2 bg-light rounded-3 shadow-sm">
          <div className="progress-bar bg-dark" role="progressbar" style={{ width: `${percentage}%` }}>
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
                {log.notes && <small className="d-block text-muted">{log.notes}</small>}
              </div>
              <button className="btn btn-danger btn-sm rounded-3" onClick={() => handleDeleteEntry(log.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
