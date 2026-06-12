import { COOLDOWN_MS, dayKey, periodKey } from "./period.mjs";
import { shiftMsFor, shiftStartFor } from "./shifts.mjs";
import {
  getStaffState,
  saveStaffState,
  finalizeDayDebt,
  syncMonthlyForStaff,
  getMonthlyForStaff,
} from "./db.mjs";
import { formatShortCaption } from "./attendance-card.mjs";
import {
  isFaceEvent,
  staffKey,
  displayName,
  eventTimeMs,
  fmtClock,
} from "./attendance-core.mjs";

export { isFaceEvent, loadEmployees, staffKey, displayName, eventTimeMs, fmtClock } from "./attendance-core.mjs";

function freshRec() {
  return {
    status: "out",
    sessionStartMs: null,
    lastScanMs: 0,
    dayKey: "",
    workedMs: 0,
    hadLeave: false,
  };
}

function rowToRec(row) {
  if (!row) return freshRec();
  return {
    status: row.status,
    sessionStartMs: row.session_start_ms,
    lastScanMs: row.last_scan_ms,
    dayKey: row.day_key,
    workedMs: row.day_worked_ms,
    hadLeave: !!row.had_leave,
  };
}

function recToRow(key, name, rec) {
  return {
    staff_key: key,
    staff_name: name,
    status: rec.status,
    session_start_ms: rec.sessionStartMs,
    last_scan_ms: rec.lastScanMs,
    day_key: rec.dayKey,
    day_worked_ms: rec.workedMs,
    had_leave: rec.hadLeave ? 1 : 0,
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

function monthSnapshot(pk, key) {
  const m = getMonthlyForStaff(pk, key);
  return {
    monthWorkedMs: m?.worked_ms || 0,
    monthDebtMs: m?.debt_ms || 0,
    workDays: m?.work_days || 0,
  };
}

export function buildAttendanceCard(ev, employees) {
  if (!isFaceEvent(ev)) return null;

  const key = staffKey(ev, employees);
  const staff = employees.staff?.[key];
  if (!staff) return null;

  const who = displayName(key, ev, employees);
  const now = eventTimeMs(ev);
  const wall = Date.now();
  const pk = periodKey(now);
  const dk = dayKey(now);
  const shiftMs = shiftMsFor(staff);

  const rec = rowToRec(getStaffState(key));
  ensureDay(rec, now);

  if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) return null;
  rec.lastScanMs = wall;

  const clock = fmtClock(ev);
  const telegramId = staff.telegramId || null;
  let kind;
  let dayDebtMs = Math.max(0, shiftMs - rec.workedMs);

  if (rec.status !== "in") {
    const back = rec.hadLeave || rec.workedMs > 0;
    rec.status = "in";
    rec.sessionStartMs = wall;
    kind = back ? "returned" : "arrived";
    saveStaffState(recToRow(key, who, rec));
  } else {
    const sessionMs = Math.max(0, wall - (rec.sessionStartMs || wall));
    rec.workedMs += sessionMs;
    rec.status = "out";
    rec.sessionStartMs = null;
    rec.hadLeave = true;
    kind = "left";
    dayDebtMs = finalizeDayDebt(key, who, dk, pk, rec.workedMs, shiftMs);
    syncMonthlyForStaff(pk, key, who);
    saveStaffState(recToRow(key, who, rec));
  }

  const month = monthSnapshot(pk, key);
  const card = {
    staffKey: key,
    staffName: who,
    telegramId,
    kind,
    clock,
    dayKey: dk,
    periodKey: pk,
    dayWorkedMs: rec.workedMs,
    dayDebtMs,
    status: rec.status,
    shiftMs,
    shiftStart: shiftStartFor(staff, key),
    ...month,
  };
  card.caption = formatShortCaption(card);
  return card;
}

export function buildMessage(ev, _state, employees) {
  const card = buildAttendanceCard(ev, employees);
  if (!card) return null;
  return card.caption;
}
