import fs from "fs";
import path from "path";

export const SHIFT_MS = 12 * 60 * 60 * 1000;
export const COOLDOWN_MS = 20_000;
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

export function fmtClock(ev) {
  const d = new Date(eventTimeMs(ev));
  return d.toLocaleTimeString("uz-UZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtHours(ms) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)} daqiqa`;
  const whole = Math.floor(h);
  const m = Math.round((h - whole) * 60);
  return m ? `${whole} soat ${m} daq` : `${whole} soat`;
}

/** keyingi skan: keldi yoki ketdi */
export function buildMessage(ev, state, employees) {
  const key = staffKey(ev, employees);
  if (!state.staff) state.staff = {};
  if (!state.staff[key]) state.staff[key] = { status: "out", shiftStart: null, lastScanMs: 0 };

  const rec = state.staff[key];
  const now = eventTimeMs(ev);
  if (rec.lastScanMs && now - rec.lastScanMs < COOLDOWN_MS) {
    return null;
  }
  rec.lastScanMs = now;

  const who = displayName(key, ev, employees);
  const clock = fmtClock(ev);
  const tg = employees.staff?.[key]?.telegramId;

  if (rec.status !== "in") {
    rec.status = "in";
    rec.shiftStart = now;
    let msg = `📥 <b>${who}</b> keldi — <b>${clock}</b>`;
    if (tg) msg += `\n<code>tg:${tg}</code>`;
    return msg;
  }

  const worked = now - (rec.shiftStart || now);
  rec.status = "out";
  rec.shiftStart = null;
  const debt = Math.max(0, SHIFT_MS - worked);

  let msg = `📤 <b>${who}</b> ketdi — <b>${clock}</b>\nIshlangan: <b>${fmtHours(worked)}</b>`;
  if (debt > 60_000) {
    msg += `\n⚠️ <b>${fmtHours(debt)}</b> ish beruvchidan qarzdor`;
  }
  if (tg) msg += `\n<code>tg:${tg}</code>`;
  return msg;
}
