import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BabyMilkTracker from "./BabyMilkTracker";
import { apiRequest } from "../api";
jest.mock("../api");
const baby = { id: 1, name: "Aria" };
const auth = { token: "token", babies: [baby], milk_amounts: [80, 200, -50] };
const day = { entries: [{ id: 1, amount: 80, notes: "Breakfast", created_at: "2026-05-04T12:00:00+00:00" }], pee_logs: [], poop_logs: [], goal: null, measurement: null };
function showTracker() {
  return render(<MemoryRouter initialEntries={["/milk_track/2026-05-04"]}><Routes><Route path="/milk_track/:date" element={<BabyMilkTracker auth={auth} selectedBaby={baby} onBabyChange={jest.fn()} onOpenSettings={jest.fn()} />} /></Routes></MemoryRouter>);
}
beforeEach(() => jest.resetAllMocks());

test("breastfeeding logs only time, guards duplicate taps, and leaves milk totals unchanged", async () => {
  let finish;
  let saved = false;
  const breastfeedingLog = { id: 7, created_at: "2026-05-04T12:30:00+00:00" };
  apiRequest.mockImplementation((path, options) => {
    if (path.startsWith("/days/")) return Promise.resolve({ ...day, breastfeeding_logs: saved ? [breastfeedingLog] : [] });
    if (path === "/breastfeeding") return new Promise((resolve) => { finish = () => { saved = true; resolve({}); }; });
    if (options.method === "DELETE") { saved = false; return Promise.resolve({}); }
    return Promise.resolve({});
  });
  showTracker(); await screen.findByText(/Breakfast/);
  const button = screen.getByRole("button", { name: "Log breastfeeding" });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(apiRequest.mock.calls.filter(([path]) => path === "/breastfeeding")).toHaveLength(1);
  expect(apiRequest).toHaveBeenCalledWith("/breastfeeding", expect.objectContaining({ babyId: 1, method: "POST", body: { date: "2026-05-04" } }));
  finish();
  const remove = await screen.findByRole("button", { name: "Delete breastfeeding entry 7" });
  expect(remove.closest("li")).toHaveTextContent("Breastfeeding");
  expect(remove.closest("li")).not.toHaveTextContent("ml");
  expect(document.querySelector(".stat-value")).toHaveTextContent("80 ml");
  fireEvent.click(remove);
  expect(apiRequest.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Delete breastfeeding entry 7" })).not.toBeInTheDocument());
  expect(apiRequest).toHaveBeenCalledWith("/breastfeeding/7", expect.objectContaining({ method: "DELETE", babyId: 1 }));
});

test("repeated taps only submit one entry while saving", async () => {
  let finish;
  apiRequest.mockImplementation((path) => path.startsWith("/days/") ? Promise.resolve(day) : new Promise((resolve) => { finish = resolve; }));
  showTracker();
  await screen.findByText(/Breakfast/);
  const add = screen.getByRole("button", { name: "80 ml" });
  fireEvent.click(add); fireEvent.click(add);
  expect(add).toBeDisabled();
  expect(apiRequest.mock.calls.filter(([path]) => path === "/entries")).toHaveLength(1);
  finish({});
  await waitFor(() => expect(add).not.toBeDisabled());
  expect(screen.getByText("Milk entry saved.")).toBeInTheDocument();
});
test("deletion needs confirmation and edit sends a correction", async () => {
  apiRequest.mockImplementation((path) => Promise.resolve(path.startsWith("/days/") ? day : {}));
  showTracker(); await screen.findByText(/Breakfast/);
  fireEvent.click(screen.getByRole("button", { name: "Delete milk entry 1" }));
  expect(apiRequest.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Keep record" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit milk entry 1" }));
  fireEvent.change(screen.getByLabelText("Amount (ml)"), { target: { value: "95" } });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/entries/1", expect.objectContaining({ method: "PUT", body: { amount: 95, notes: "Breakfast" } })));
  await screen.findByText("Milk entry updated.");
  fireEvent.click(screen.getByRole("button", { name: "Delete milk entry 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/entries/1", expect.objectContaining({ method: "DELETE" })));
});

test.each([
  ["Milk", "entries", "entries"],
  ["Pee", "pee", "pee_logs"],
  ["Poop", "poop", "poop_logs"],
  ["Breastfeeding", "breastfeeding", "breastfeeding_logs"],
])("%s time corrections use the viewed day, persist after refresh, and reorder logs", async (type, endpoint, field) => {
  const record = { id: 7, created_at: new Date(2026, 4, 6, 12, 0, 37).toISOString(), ...(type === "Milk" ? { amount: 100, notes: "Late log" } : {}) };
  const breakfast = { ...day.entries[0], created_at: new Date(2026, 4, 4, 9, 0).toISOString() };
  let currentDay = { ...day, entries: [breakfast] };
  currentDay[field] = [...(currentDay[field] || []), record];
  apiRequest.mockImplementation((path, options) => {
    if (options.method === "PUT") {
      currentDay = { ...currentDay, [field]: currentDay[field].map((log) => log.id === 7 ? { ...log, ...options.body } : log) };
      return Promise.resolve({});
    }
    return Promise.resolve(currentDay);
  });
  showTracker();
  const editName = `Edit ${type.toLowerCase()} entry 7`;
  const edit = await screen.findByRole("button", { name: editName });
  expect(document.querySelector(".log-item")).toBe(edit.closest("li"));
  fireEvent.click(edit);
  expect(screen.getByLabelText("Time")).toHaveValue("12:00");
  if (type !== "Milk") expect(screen.queryByLabelText("Amount (ml)")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:15" } });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await screen.findByText(`${type} entry updated.`);
  expect(apiRequest).toHaveBeenCalledWith(`/${endpoint}/7`, expect.objectContaining({
    method: "PUT", babyId: 1, body: { ...(type === "Milk" ? { amount: 100, notes: "Late log" } : {}), created_at: new Date(2026, 4, 4, 8, 15).toISOString() },
  }));
  const updated = screen.getByRole("button", { name: editName });
  const rows = document.querySelectorAll(".log-item");
  expect(rows[rows.length - 1]).toBe(updated.closest("li"));
  expect(document.querySelector(".stat-value")).toHaveTextContent(type === "Milk" ? "180 ml" : "80 ml");
  fireEvent.click(updated);
  expect(screen.getByLabelText("Time")).toHaveValue("08:15");
  fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
});

test("cancelling a time correction leaves the saved record alone", async () => {
  apiRequest.mockResolvedValue(day);
  showTracker();
  fireEvent.click(await screen.findByRole("button", { name: "Edit milk entry 1" }));
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:15" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
  expect(apiRequest.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);
  expect(screen.queryByLabelText("Time")).not.toBeInTheDocument();
});

test.each([
  ["Unable to save.", "Unable to save."],
  ["permission denied for table tracker_milk_entries", "Time changes aren't enabled yet. This entry has not been changed."],
])("a failed time correction shows %s beside the editor and keeps the draft", async (error, message) => {
  apiRequest.mockImplementation((path, options) => options.method === "PUT" ? Promise.reject(new Error(error)) : Promise.resolve(day));
  showTracker();
  fireEvent.click(await screen.findByRole("button", { name: "Edit milk entry 1" }));
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:15" } });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  const form = screen.getByRole("button", { name: "Save entry" }).closest("form");
  expect(await within(form).findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Time")).toHaveValue("08:15");
  expect(screen.getByRole("button", { name: "Save entry" })).not.toBeDisabled();
  expect(screen.queryByText("Milk entry updated.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit milk entry 1" }));
  expect(within(screen.getByRole("button", { name: "Save entry" }).closest("form")).queryByRole("alert")).not.toBeInTheDocument();
});
test("goals and measurements are saved against the selected date and baby", async () => {
  apiRequest.mockImplementation((path) => Promise.resolve(path.startsWith("/days/") ? day : {}));
  showTracker(); await screen.findByText(/Breakfast/);
  fireEvent.click(screen.getByRole("button", { name: "Goals & measurements" }));
  fireEvent.change(screen.getByLabelText("Goal (ml)"), { target: { value: "700" } });
  fireEvent.click(screen.getByRole("button", { name: "Save goal" }));
  await screen.findByText("Daily goal saved.");
  expect(apiRequest).toHaveBeenCalledWith("/goals", expect.objectContaining({ babyId: 1, body: { date: "2026-05-04", goal: 700 } }));
  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "5.2" } });
  fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Save measurements" }));
  await screen.findByText("Measurements saved.");
  expect(apiRequest).toHaveBeenCalledWith("/measurements", expect.objectContaining({ babyId: 1, body: { date: "2026-05-04", weight: 5.2, height: 60 } }));
});
