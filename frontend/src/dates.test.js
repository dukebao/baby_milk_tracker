import { localDate, parseLocalDate, shiftDate, shiftMonth } from "./dates";

test("calendar dates use local date components even late at night", () => {
  expect(localDate(new Date(2026, 9, 3, 23, 59))).toBe("2026-10-03");
  expect(parseLocalDate("2026-02-30")).toBeNull();
  expect(parseLocalDate("not-a-date")).toBeNull();
});
test("month navigation from January 31 visits February and crosses year boundaries", () => {
  expect(localDate(shiftMonth(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  expect(localDate(shiftMonth(new Date(2026, 0, 31), -1))).toBe("2025-12-01");
  expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
  expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
});
