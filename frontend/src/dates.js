// Calendar dates stay in the device's local timezone; never round-trip through UTC.
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDate(date) === value ? date : null;
}

export function shiftDate(value, days) {
  const date = parseLocalDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
}

export function formatDate(value) {
  return parseLocalDate(value)?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) || value;
}
