/** Har bir hodimning smena vaqti (12 soat) */
export const DEFAULT_SHIFT_HOURS = 12;

const GROUPS = {
  early: { start: "07:30", keys: ["6991673998", "5465963344", "6001619806", "5412958249"] },
  mid: { start: "09:00", keys: ["6931958983", "924612402", "7703650930", "8547365654"] },
  late: { start: "10:00", keys: ["5732350707", "8440127425"] },
};

export function shiftStartFor(staff, staffKey) {
  if (staff?.shiftStart) return staff.shiftStart;
  if (staff?.shiftVariable) {
    return process.env.SUBSTITUTE_SHIFT_START || "09:00";
  }
  for (const g of Object.values(GROUPS)) {
    if (g.keys.includes(staffKey)) return g.start;
  }
  return "09:00";
}

export function shiftMsFor(staff) {
  const h = Number(staff?.shiftHours ?? DEFAULT_SHIFT_HOURS);
  return h * 60 * 60 * 1000;
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
  return new Date(`${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:00`).getTime();
}

export function reminderMsBefore(staff, staffKey, ms = Date.now()) {
  return shiftStartMsToday(staff, staffKey, ms) - 10 * 60 * 1000;
}
