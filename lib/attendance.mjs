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

function fmtDuration(ms) {
  if (ms <= 0) return "0 daqiqa";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} daqiqa`;
  if (m === 0) return `${h} soat`;
  return `${h} soat ${m} daqiqa`;
}

function dayKey(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
}

function freshRecord() {
  return {
    status: "out",
    dayKey: "",
    workedMs: 0,
    hadLeave: false,
    sessionStartMs: null,
    lastScanMs: 0,
  };
}

function ensureDay(rec, now) {
  const dk = dayKey(now);
  if (rec.dayKey !== dk) {
    rec.dayKey = dk;
    rec.workedMs = 0;
    rec.hadLeave = false;
    rec.status = "out";
    rec.sessionStartMs = null;
  }
}

/** Bugun: keldi → ketdi → qaytdi (vaqt jamlanadi) */
export function buildMessage(ev, state, employees) {
  const key = staffKey(ev, employees);
  if (!state.staff) state.staff = {};
  if (!state.staff[key]) state.staff[key] = freshRecord();

  const rec = state.staff[key];
  const now = eventTimeMs(ev);
  const wall = Date.now();
  ensureDay(rec, now);

  if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) {
    return null;
  }
  rec.lastScanMs = wall;

  const who = displayName(key, ev, employees);
  const clock = fmtClock(ev);

  if (rec.status !== "in") {
    rec.status = "in";
    rec.sessionStartMs = wall;
    const back = rec.hadLeave || rec.workedMs > 0;

    if (back) {
      let msg = `🔄 <b>${who}</b> yana ishga qaytdi\n🕐 ${clock}`;
      if (rec.workedMs > 0) {
        msg += `\n⏱ Avval ishlangan: <b>${fmtDuration(rec.workedMs)}</b>`;
      }
      return msg;
    }
    return `📥 <b>${who}</b> ishga keldi\n🕐 ${clock}`;
  }

  const sessionMs = Math.max(0, wall - (rec.sessionStartMs || wall));
  rec.workedMs += sessionMs;
  rec.status = "out";
  rec.sessionStartMs = null;
  rec.hadLeave = true;

  const left = Math.max(0, SHIFT_MS - rec.workedMs);
  let msg = `📤 <b>${who}</b> ishdan ketdi\n🕐 ${clock}\n⏱ Bugun ishlangan: <b>${fmtDuration(rec.workedMs)}</b>`;
  if (left > 60_000) {
    msg += `\n📋 Qolgan ish vaqti: <b>${fmtDuration(left)}</b>`;
  } else {
    msg += `\n✅ Kunlik mehnat vaqti bajarildi`;
  }
  return msg;
}
