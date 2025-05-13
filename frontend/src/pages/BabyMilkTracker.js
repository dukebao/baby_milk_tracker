import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

export default function BabyMilkTracker() {
  const { date } = useParams();
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [peeLogs, setPeeLogs] = useState([]);
  const [poopLogs, setPoopLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");

  const API_URL = "http://localhost:8000";

  const refreshAllLogs = () => {
    fetch(`${API_URL}/pee/${date}`)
      .then((res) => res.json())
      .then((pee) => {
        fetch(`${API_URL}/poop/${date}`)
          .then((res) => res.json())
          .then((poop) => {
            const milkLogs = logs.map(log => ({ ...log, type: 'Milk' }));
            const peeLogs = (pee.logs || []).map(log => ({ ...log, type: 'Pee' }));
            const poopLogs = (poop.logs || []).map(log => ({ ...log, type: 'Poop' }));
            const all = [...milkLogs, ...peeLogs, ...poopLogs].sort((a, b) =>
              new Date(b.created_at || b.date) - new Date(a.created_at || a.date)
            );
            setAllLogs(all);
            setPeeLogs(pee.logs || []);
            setPoopLogs(poop.logs || []);
          });
      });
  };


  useEffect(() => {
    fetch(`${API_URL}/entries/${date}`)
      .then((res) => res.json())
      .then((data) => {
        setLogs((data.entries || []).slice().sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
        calculateTotal(data.entries || []);
      })
      .catch((error) => console.error("Error fetching logs:", error));
  }, [date]);

  const handleAddPoop = () => {
    fetch(`${API_URL}/poop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    })
      .then(res => res.json())
      .then(data => {
        console.log("✅ Poop logged", data);
        // Refresh logs
        refreshAllLogs();
      });
  };


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
          setLogs((data.entries || []).slice().sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
          calculateTotal(data.entries || []);
        });
    };

    return () => socket.close();
  }, [date]);

  const calculateTotal = (logs) => {
    const totalAmount = logs.reduce((sum, entry) => sum + entry.amount, 0);
    setTotal(totalAmount);
  };

  const handleAddEntry = (amount, note = "") => {
    const parsedAmount = amount === "" || isNaN(amount) ? 0 : parseFloat(amount);
    if (parsedAmount === 0 && note.trim() === "") {
      console.warn("⚠️ Entry must have either an amount or a note.");
      return;
    }

    fetch(`${API_URL}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        amount: parsedAmount,
        notes: note.trim(),
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
        setCustomAmount("");
        setCustomNote("");
      })
      .catch((error) => console.error("❌ Error adding entry:", error));
  };

  const handleDeleteEntry = (id, type) => {
    let endpoint = "/entries";
    if (type === "Pee") endpoint = "/pee";
    else if (type === "Poop") endpoint = "/poop";

    fetch(`${API_URL}${endpoint}/${id}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        console.log(`✅ ${type} entry deleted`, data);
        refreshAllLogs();  // 👈 Add this line to trigger re-render
      })
      .catch((error) => console.error(`Error deleting ${type} entry:`, error));
  };



  const formatTime = (timestamp) => {
    const dateObj = new Date(timestamp);
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {

    fetch(`${API_URL}/pee/${date}`)
      .then((res) => res.json())
      .then((data) => setPeeLogs(data.logs || []));

    fetch(`${API_URL}/poop/${date}`)
      .then((res) => res.json())
      .then((data) => setPoopLogs(data.logs || []));

    fetch(`${API_URL}/pee/${date}`)
      .then((res) => res.json())
      .then((pee) => {
        fetch(`${API_URL}/poop/${date}`)
          .then((res) => res.json())
          .then((poop) => {
            const milkLogs = logs.map(log => ({
              ...log,
              type: 'Milk'
            }));
            const peeLogs = (pee.logs || []).map(log => ({
              ...log,
              type: 'Pee'
            }));
            const poopLogs = (poop.logs || []).map(log => ({
              ...log,
              type: 'Poop'
            }));
            const all = [...milkLogs, ...peeLogs, ...poopLogs].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
            setAllLogs(all);
          });
      });
  }, [logs, date]);

  const handleAddPee = () => {
    fetch(`${API_URL}/pee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    })
      .then(res => res.json())
      .then(data => {
        console.log("✅ Pee logged", data);
        // Refresh logs
        refreshAllLogs();
      });
  };



  return (
    <div className="container mt-4">
      <h1 className="fw-bold mb-3 text-center fs-4">Milk Tracker - {date}</h1>

      <div className="mb-3 text-center">
        <Link to="/" className="btn btn-outline-dark rounded-3 fs-6">← Back to Calendar</Link>
      </div>

      <div className="mt-4">
        <h2 className="h5 fs-5">Score for the day !!</h2>

        <div className="alert alert-info shadow-sm fs-6">
          🍼 {total} ml &nbsp;&nbsp;|&nbsp;&nbsp; 💧 {peeLogs.length} times &nbsp;&nbsp;|&nbsp;&nbsp; 💩 {poopLogs.length} times
        </div>


      </div>

      <div className="mt-4">

        <div className="card border-0 shadow-sm rounded-3 mt-4">
          <div className="card-body">
            <h2 className="h5 mb-3 fs-5">Add Entry</h2>

            <div className="row g-2">
              <div className="col-12 col-md-auto">
                <button className="btn btn-warning rounded-3 w-100 fs-6 text-center" onClick={handleAddPee}>💧 Pee</button>
              </div>
              <div className="col-12 col-md-auto">
                <button className="btn btn-secondary rounded-3 w-100 fs-6 text-center" onClick={handleAddPoop}>💩 Poop</button>
              </div>
              <div className="col-12 col-md-auto">
                <button className="btn btn-dark rounded-3 w-100 fs-6 text-center" onClick={() => handleAddEntry(80)}>🍼 80 ml</button>
              </div>
              <div className="col-12 col-md-auto">
                <button className="btn btn-dark rounded-3 w-100 fs-6 text-center" onClick={() => handleAddEntry(200)}>🍼 200 ml</button>
              </div>
              <div className="col-12 col-md-auto">
                <button className="btn btn-danger rounded-3 w-100 fs-6 text-center" onClick={() => handleAddEntry(-50)}>🤮 −50 ml</button>
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

        <div className="mt-4">
          <h2 className="h5 fs-5">Logs</h2>
          <ul className="list-group mt-2 shadow-sm">
            {allLogs.map((log, index) => (
              <li key={index} className="list-group-item d-flex justify-content-between align-items-center border-0">
                <div>
                  <span className="fs-6">{formatTime(log.created_at || log.date)} - {log.type === 'Milk' ? '🍼' : log.type === 'Pee' ? '💧' : log.type === 'Poop' ? '💩' : log.type}{log.amount ? `${log.amount} ml` : ''}</span>
                  {log.notes && <small className="d-block text-muted">{log.notes}</small>}
                </div>
                {log.id && (
                  <button className="btn btn-danger btn-sm rounded-3" onClick={() => handleDeleteEntry(log.id, log.type)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
// Add any additional CSS styles here if needed