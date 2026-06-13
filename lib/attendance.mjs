import { COOLDOWN_MS, dayKey, periodKey } from "./period.mjs";
import { shiftMsFor, shiftStartFor, shiftEndFor, shiftHoursFor, formatShiftLabel, hasShiftTracking, calcLateMs, formatLateLabel, calcEarlyMs, formatEarlyLabel, calcOvertimeMs, formatOvertimeLabel } from "./shifts.mjs";
import {
  getDb,
  getStaffState,
  saveStaffState,
  finalizeDayDebt,
  syncMonthlyForStaff,
  getMonthlyForStaff,
  wasSerialProcessed,
  markSerial,
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

  return getDb().transaction(() => {
    const serial = Number(ev.serialNo || 0);
    if (serial && wasSerialProcessed(serial)) return null;

    const who = displayName(key, ev, employees);
    const now = eventTimeMs(ev);
    const wall = Date.now();
    const pk = periodKey(now);
    const dk = dayKey(now);
    const trackShift = hasShiftTracking(staff);
    const shiftMs = trackShift ? shiftMsFor(staff) : 0;

    const rec = rowToRec(getStaffState(key));
    ensureDay(rec, now);

    if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) return null;
    rec.lastScanMs = wall;

    const clock = fmtClock(ev);
    const telegramId = staff.telegramId || null;
    let kind;
    let dayDebtMs = Math.max(0, shiftMs - rec.workedMs);

    if (rec.status !== "in") {
      rec.status = "in";
      rec.sessionStartMs = wall;
      kind = trackShift && (rec.hadLeave || rec.workedMs > 0) ? "returned" : "arrived";
      saveStaffState(recToRow(key, who, rec));
    } else {
      const sessionMs = Math.max(0, wall - (rec.sessionStartMs || wall));
      if (trackShift) rec.workedMs += sessionMs;
      rec.status = "out";
      rec.sessionStartMs = null;
      if (trackShift) rec.hadLeave = true;
      kind = "left";
      if (trackShift) {
        dayDebtMs = finalizeDayDebt(key, who, dk, pk, rec.workedMs, shiftMs);
        syncMonthlyForStaff(pk, key, who);
      }
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
      noShift: !trackShift,
      ...month,
    };
    if (trackShift) {
      card.shiftStart = shiftStartFor(staff, key);
      card.shiftEnd = shiftEndFor(staff, key);
      card.shiftHours = shiftHoursFor(staff);
      card.shiftLabel = formatShiftLabel(staff, key);
      if (kind === "arrived") {
        card.lateMs = calcLateMs(staff, key, now);
        card.lateLabel = formatLateLabel(card.lateMs);
        card.earlyMs = calcEarlyMs(staff, key, now);
        card.earlyLabel = formatEarlyLabel(card.earlyMs);
      }
      if (kind === "left") {
        card.overtimeMs = calcOvertimeMs(staff, key, now);
        card.overtimeLabel = formatOvertimeLabel(card.overtimeMs);
      }
    }
    card.caption = formatShortCaption(card);
    if (serial) markSerial(serial);
    return card;
  })();
}

export function buildMessage(ev, _state, employees) {
  const card = buildAttendanceCard(ev, employees);
  if (!card) return null;
  return card.caption;
}
