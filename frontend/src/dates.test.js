import { localDate, localTime, logTimeToISO, parseLocalDate, shiftDate, shiftMonth } from "./dates";

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

test("log times display local hours and save against the selected calendar day", () => {
  expect(localTime(new Date(2026, 4, 6, 8, 5, 37).toISOString())).toBe("08:05");
  expect(logTimeToISO("2026-05-04", "08:05")).toBe(new Date(2026, 4, 4, 8, 5).toISOString());
  expect(logTimeToISO("2026-05-04", "00:00")).toBe(new Date(2026, 4, 4, 0, 0).toISOString());
  expect(logTimeToISO("2026-05-04", "23:59")).toBe(new Date(2026, 4, 4, 23, 59).toISOString());
});

test("invalid log dates and clock times are rejected", () => {
  expect(localTime("invalid")).toBe("");
  expect(logTimeToISO("2026-02-30", "08:00")).toBeNull();
  for (const time of ["", "8:00", "24:00", "12:60", "-1:30", "08:00:10"]) {
    expect(logTimeToISO("2026-05-04", time)).toBeNull();
  }
});

// Also run this suite with TZ=America/New_York to exercise the DST gap.
test("a clock time skipped by daylight saving is rejected", () => {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== "America/New_York") return;
  expect(logTimeToISO("2026-03-08", "02:30")).toBeNull();
  expect(logTimeToISO("2026-03-08", "03:30")).toBe("2026-03-08T07:30:00.000Z");
});
