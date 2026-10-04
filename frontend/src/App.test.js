import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { apiRequest } from "./api";
import { restoreSession, watchSession } from "./supabase";
jest.mock("./api");
jest.mock("./supabase", () => ({ restoreSession: jest.fn(), watchSession: jest.fn(), googleEnabled: false }));
const auth = { token: "token", user: { id: 1, email: "parent@example.com" }, babies: [{ id: 1, name: "Aria", household_id: 1 }], households: [{ id: 1, name: "Family" }], milk_amounts: [80, 200, -50] };

beforeEach(() => {
  jest.resetAllMocks(); localStorage.clear(); window.history.replaceState({}, "", "/");
  restoreSession.mockResolvedValue(null);
  watchSession.mockImplementation((callback) => { callback(null); return () => {}; });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
function signedIn() {
  watchSession.mockImplementation((callback) => { callback({ access_token: auth.token, user: auth.user }); return () => {}; });
}
test("renders login when signed out", () => {
  render(<App />); expect(screen.getAllByRole("button", { name: "Login" })).toHaveLength(2);
});
test("network failures preserve login and Retry reconnects", async () => {
  signedIn();
  let connected = false;
  apiRequest.mockImplementation((path) => {
    if (path === "/me") return connected ? Promise.resolve(auth) : Promise.reject(new Error("Can't connect."));
    return Promise.resolve({ days: [], earliest_date: null });
  });
  render(<App />);
  await screen.findByText(/Your login is saved/);
  expect(localStorage.getItem("milk-tracker-auth")).toBeNull();
  expect(screen.getByRole("button", { name: "Log today" })).toBeInTheDocument();
  connected = true;
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  await waitFor(() => expect(screen.queryByText(/Your login is saved/)).not.toBeInTheDocument());
});
test("invalid sessions sign out", async () => {
  signedIn();
  apiRequest.mockImplementation((path) => path === "/me" ? Promise.reject(Object.assign(new Error("Session expired"), { status: 401 })) : Promise.resolve({ days: [] }));
  render(<App />);
  await screen.findAllByRole("button", { name: "Login" });
  expect(localStorage.getItem("milk-tracker-auth")).toBeNull();
});
test("settings drawer exposes preferences and export controls and restores focus", async () => {
  signedIn();
  apiRequest.mockImplementation((path) => {
    if (path === "/me") return Promise.resolve(auth);
    if (path.endsWith("/members")) return Promise.resolve({ members: [{ user_id: 1, email: auth.user.email, role: "owner" }] });
    return Promise.resolve({ days: [], earliest_date: "2026-05-04" });
  });
  render(<App />);
  const settings = await screen.findByRole("button", { name: "Settings" });
  settings.focus(); fireEvent.click(settings);
  expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  await screen.findByRole("button", { name: "Create invite link" });
  expect(screen.getByRole("button", { name: "Edit amounts" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back up all records" })).toBeInTheDocument();
  const darkMode = screen.getByRole("switch", { name: /Dark mode/ });
  fireEvent.click(darkMode);
  expect(darkMode).toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("milk-tracker-theme")).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(settings).toHaveFocus();
});

test("saved dark mode is restored when reopening the app", () => {
  localStorage.setItem("milk-tracker-theme", "dark");
  const view = render(<App />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  view.unmount();
  render(<App />);
  expect(document.documentElement).toHaveAttribute("data-bs-theme", "dark");
});

test("registration only asks for credentials; baby names are entered in settings", async () => {
  apiRequest.mockResolvedValue({});
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  expect(screen.queryByText("Baby name")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "parent@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "testpass" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/auth/register", {
    method: "POST", body: { email: "parent@example.com", password: "testpass" },
  }));
});

test("renaming the selected baby in settings updates the home page without adding a baby", async () => {
  signedIn();
  apiRequest.mockImplementation((path, options) => {
    if (path === "/me") return Promise.resolve(auth);
    if (path.endsWith("/members")) return Promise.resolve({ members: [{ user_id: 1, email: auth.user.email, role: "owner" }] });
    if (path === "/babies/1" && options.method === "PUT") return Promise.resolve({ baby: { ...auth.babies[0], name: options.body.name } });
    return Promise.resolve({ days: [], earliest_date: null });
  });
  render(<App />);
  expect(screen.queryByRole("textbox", { name: "Baby name" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.change(await screen.findByLabelText("Baby name"), { target: { value: "Aria Rose" } });
  fireEvent.click(screen.getByRole("button", { name: "Save baby name" }));
  await screen.findByText("Baby name saved.");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("heading", { name: "Aria Rose" })).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith("/babies/1", expect.objectContaining({ method: "PUT", body: { name: "Aria Rose" } }));
  expect(apiRequest.mock.calls.some(([path, options]) => path === "/babies" && options.method === "POST")).toBe(false);
});

test("registration confirmation keeps the user on login and explains the email step", async () => {
  apiRequest.mockResolvedValue({ confirmation_required: true });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "parent@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "testpass" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
  await screen.findByText(/Check your email to confirm/);
  expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
});

test("Supabase password recovery event opens the new password form", async () => {
  watchSession.mockImplementation((callback) => { callback({ access_token: auth.token, user: auth.user }, "PASSWORD_RECOVERY"); return () => {}; });
  apiRequest.mockImplementation((path) => Promise.resolve(path === "/me" ? auth : { days: [] }));
  render(<App />);
  fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpass123" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await screen.findByRole("button", { name: "Settings" });
  expect(apiRequest).toHaveBeenCalledWith("/auth/password", { method: "POST", body: { password: "newpass123" } });
});

test("legacy stored tokens cannot bypass Supabase login", () => {
  localStorage.setItem("milk-tracker-auth", JSON.stringify(auth));
  render(<App />);
  expect(screen.getAllByRole("button", { name: "Login" })).toHaveLength(2);
  expect(localStorage.getItem("milk-tracker-auth")).toBeNull();
});

const newFamily = { ...auth,
  households: [{ id: 1, name: "My family", created_by: 1, setup_completed: false }],
  babies: [{ id: 1, name: "Baby", household_id: 1 }],
};
test("new owners configure both names before tracking and completed setup stays saved", async () => {
  signedIn();
  let profile = newFamily;
  apiRequest.mockImplementation((path, options) => {
    if (path === "/me") return Promise.resolve(profile);
    if (path === "/households/1/setup") {
      const household = { ...newFamily.households[0], name: options.body.household_name, setup_completed: true };
      const baby = { ...newFamily.babies[0], name: options.body.baby_name };
      profile = { ...newFamily, households: [household], babies: [baby] };
      return Promise.resolve({ household, baby });
    }
    return Promise.resolve({ days: [], earliest_date: null });
  });
  const view = render(<App />);
  await screen.findByRole("heading", { name: /Let’s set up your family/ });
  expect(screen.queryByRole("button", { name: "Log today" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save & start tracking" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Household name"), { target: { value: " Chen family " } });
  fireEvent.change(screen.getByLabelText("Baby name"), { target: { value: " Aria " } });
  fireEvent.click(screen.getByRole("button", { name: "Save & start tracking" }));
  await screen.findByRole("heading", { name: "Aria" });
  expect(apiRequest).toHaveBeenCalledWith("/households/1/setup", expect.objectContaining({ body: { baby_id: 1, household_name: "Chen family", baby_name: "Aria" } }));
  view.unmount(); render(<App />);
  await screen.findByRole("heading", { name: "Aria" });
  expect(screen.queryByLabelText("Household name")).not.toBeInTheDocument();
});

test("failed setup keeps both names available for retry and does not open tracking", async () => {
  signedIn();
  apiRequest.mockImplementation((path) => path === "/me" ? Promise.resolve(newFamily) : Promise.reject(new Error("Offline")));
  render(<App />);
  fireEvent.change(await screen.findByLabelText("Household name"), { target: { value: "Family" } });
  fireEvent.change(screen.getByLabelText("Baby name"), { target: { value: "Aria" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & start tracking" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Household name")).toHaveValue("Family");
  expect(screen.getByLabelText("Baby name")).toHaveValue("Aria");
  expect(screen.queryByRole("button", { name: "Log today" })).not.toBeInTheDocument();
});

test("invited caregivers join their shared family without configuring an unrelated household", async () => {
  signedIn(); window.history.replaceState({}, "", "/join/invite");
  const sharedBaby = { id: 2, name: "Shared baby", household_id: 2 };
  apiRequest.mockImplementation((path) => {
    if (path === "/me") return Promise.resolve(newFamily);
    if (path === "/invites/invite") return Promise.resolve({ household: { name: "Shared family" }, expires_at: "2099-01-01" });
    if (path === "/invites/invite/accept") return Promise.resolve({ ...newFamily,
      babies: [...newFamily.babies, sharedBaby], households: [...newFamily.households, { id: 2, name: "Shared family", created_by: 2, setup_completed: false }], accepted_household_id: 2 });
    return Promise.resolve({ days: [], earliest_date: null });
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Shared family" });
  fireEvent.click(screen.getByRole("button", { name: "Join Household" }));
  await screen.findByRole("heading", { name: "Shared baby" });
  expect(screen.queryByLabelText("Household name")).not.toBeInTheDocument();
});
