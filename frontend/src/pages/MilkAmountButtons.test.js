import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MilkAmountButtons from "./MilkAmountButtons";
import { apiRequest } from "../api";

jest.mock("../api");

beforeEach(() => jest.resetAllMocks());

test("saves preferred buttons, uses their amounts, and reloads saved preferences", async () => {
  apiRequest.mockResolvedValueOnce({ milk_amounts: [80, 200, -50] });
  const onAddEntry = jest.fn();
  const view = render(<MilkAmountButtons token="user-token" onAddEntry={onAddEntry} />);
  await screen.findByRole("button", { name: "80 ml" });
  fireEvent.click(screen.getByRole("button", { name: "Edit amounts" }));
  fireEvent.change(screen.getByLabelText("Button 1 (ml)"), { target: { value: "120" } });
  apiRequest.mockResolvedValueOnce({ milk_amounts: [120, 200, -50] });
  fireEvent.click(screen.getByRole("button", { name: "Save amounts" }));
  fireEvent.click(await screen.findByRole("button", { name: "120 ml" }));
  expect(onAddEntry).toHaveBeenCalledWith(120);
  expect(apiRequest).toHaveBeenLastCalledWith("/me/preferences", {
    token: "user-token", method: "PUT", body: { milk_amounts: [120, 200, -50] },
  });
  view.unmount();
  apiRequest.mockResolvedValueOnce({ milk_amounts: [120, 200, -50] });
  render(<MilkAmountButtons token="user-token" onAddEntry={onAddEntry} />);
  await screen.findByRole("button", { name: "120 ml" });
});

test("cancel discards drafts and failed saves preserve the saved buttons", async () => {
  apiRequest.mockResolvedValueOnce({ milk_amounts: [80, 200, -50] });
  render(<MilkAmountButtons token="user-token" onAddEntry={jest.fn()} />);
  await screen.findByRole("button", { name: "80 ml" });
  fireEvent.click(screen.getByRole("button", { name: "Edit amounts" }));
  fireEvent.change(screen.getByLabelText("Button 1 (ml)"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "80 ml" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit amounts" }));
  expect(screen.getByLabelText("Button 1 (ml)")).toHaveValue(80);
  fireEvent.change(screen.getByLabelText("Button 1 (ml)"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save amounts" }));
  expect(screen.getByRole("alert")).toHaveTextContent("nonzero");
  expect(apiRequest).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Button 1 (ml)"), { target: { value: "90" } });
  apiRequest.mockRejectedValueOnce(new Error("Save failed"));
  fireEvent.click(screen.getByRole("button", { name: "Save amounts" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Save failed"));
  expect(screen.getByRole("button", { name: "80 ml" })).toBeInTheDocument();
  expect(screen.getByLabelText("Button 1 (ml)")).toHaveValue(90);
});
