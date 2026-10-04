import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CalendarPage from "./CalendarPage";
import { apiRequest } from "../api";
jest.mock("../api");
test("First records opens historical month and marks dates with totals", async () => {
  apiRequest.mockResolvedValue({ earliest_date: "2026-05-04", days: [{ date: "2026-05-04", milk_ml: 100, pee_logs: 3, poop_logs: 2 }] });
  render(<MemoryRouter><CalendarPage auth={{ token: "token", babies: [{ id: 1, name: "Aria" }] }} selectedBaby={{ id: 1, name: "Aria" }} onBabyChange={jest.fn()} onOpenSettings={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "First records" }));
  await screen.findByText("May 2026");
  expect(await screen.findByRole("button", { name: "2026-05-04, has records" })).toBeInTheDocument();
  expect(screen.getByText("100 ml")).toBeInTheDocument();
  expect(screen.getByText("3 pee · 2 poop")).toBeInTheDocument();
});
