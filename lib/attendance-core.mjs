import fs from "fs";
import path from "path";

const TZ = "Asia/Tashkent";

export function isFaceEvent(ev) {
  const n = String(ev.name || "").trim();
  if (!n || n === "?" || n.toLowerCase() === "noma'lum") return false;
  return Number(ev.minor) === 75;
}

export function loadEmployees(dataDir) {
  const f = path.join(dataDir, "employees.json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return { staff: {} };
  }
}

export function staffKey(ev, employees) {
  const no = String(ev.employeeNoString || ev.employeeNo || "").trim();
  if (no && employees.staff[no]) return no;
  const name = String(ev.name || "").trim().toUpperCase();
  for (const [id, s] of Object.entries(employees.staff || {})) {
    if (String(s.deviceName || "").toUpperCase() === name) return id;
    if (`${s.lastName} ${s.firstName}`.toUpperCase() === name) return id;
    if (`${s.firstName} ${s.lastName}`.toUpperCase() === name) return id;
  }
  return no || name;
}

export function displayName(key, ev, employees) {
  const s = employees.staff?.[key];
  if (s?.firstName && s?.lastName) return `${s.firstName} ${s.lastName}`;
  return String(ev.name || key).trim();
}

export function eventTimeMs(ev) {
  const t = ev.time || ev.dateTime;
  if (!t) return Date.now();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}

export function parseClockToday(hhmm, baseMs = Date.now()) {
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(baseMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:00`
  ).getTime();
}

export function fmtClock(ev) {
  const d = new Date(eventTimeMs(ev));
  return d.toLocaleTimeString("uz-UZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
