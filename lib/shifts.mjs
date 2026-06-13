/** Har bir hodimning smena vaqti */
export const DEFAULT_SHIFT_HOURS = 12;

export function shiftStartFor(staff, staffKey) {
  if (staff?.shiftStart) return staff.shiftStart;
  return "09:00";
}

export function shiftHoursFor(staff) {
  return Number(staff?.shiftHours ?? DEFAULT_SHIFT_HOURS);
}

export function shiftMsFor(staff) {
  return shiftHoursFor(staff) * 60 * 60 * 1000;
}

/** Smena tugashi: 09:00 + 12 soat → 21:00 */
export function shiftEndFor(staff, staffKey) {
  const [hh, mm] = shiftStartFor(staff, staffKey).split(":").map(Number);
  const totalMin = hh * 60 + mm + shiftHoursFor(staff) * 60;
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/** Telegram caption uchun: «07:30 — 19:30 (12 soat)» */
export function formatShiftLabel(staff, staffKey) {
  const start = shiftStartFor(staff, staffKey);
  const end = shiftEndFor(staff, staffKey);
  const h = shiftHoursFor(staff);
  return `${start} — ${end} (${h} soat)`;
}

export function shiftStartMsToday(staff, staffKey, ms = Date.now()) {
  const start = shiftStartFor(staff, staffKey);
  const [hh, mm] = start.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  return new Date(
    `${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:00`
  ).getTime();
}

export function reminderMsBefore(staff, staffKey, ms = Date.now()) {
  return shiftStartMsToday(staff, staffKey, ms) - 10 * 60 * 1000;
}

export function listAllShifts(employees) {
  const rows = [];
  for (const [key, s] of Object.entries(employees.staff || {})) {
    rows.push({
      key,
      name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      shift: formatShiftLabel(s, key),
      start: shiftStartFor(s, key),
      end: shiftEndFor(s, key),
      hours: shiftHoursFor(s),
    });
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}
