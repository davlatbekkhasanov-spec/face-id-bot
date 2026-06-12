import { COOLDOWN_MS, dayKey, periodKey, SHIFT_MS, fmtDuration } from "./period.mjs";
import { getStaffState, saveStaffState, finalizeDayDebt, syncMonthlyForStaff } from "./db.mjs";
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

export function buildMessage(ev, _state, employees) {
  if (!isFaceEvent(ev)) return null;

  const key = staffKey(ev, employees);
  const who = displayName(key, ev, employees);
  const now = eventTimeMs(ev);
  const wall = Date.now();
  const pk = periodKey(now);
  const dk = dayKey(now);

  const rec = rowToRec(getStaffState(key));
  ensureDay(rec, now);

  if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) return null;
  rec.lastScanMs = wall;

  const clock = fmtClock(ev);

  if (rec.status !== "in") {
    rec.status = "in";
    rec.sessionStartMs = wall;
    const back = rec.hadLeave || rec.workedMs > 0;
    saveStaffState(recToRow(key, who, rec));

    if (back) {
      let msg = `🔄 <b>${who}</b> yana ishga qaytdi\n🕐 ${clock}`;
      if (rec.workedMs > 0) msg += `\n⏱ Avval ishlangan: <b>${fmtDuration(rec.workedMs)}</b>`;
      return msg;
    }
    return `📥 <b>${who}</b> ishga keldi\n🕐 ${clock}`;
  }

  const sessionMs = Math.max(0, wall - (rec.sessionStartMs || wall));
  rec.workedMs += sessionMs;
  rec.status = "out";
  rec.sessionStartMs = null;
  rec.hadLeave = true;

  finalizeDayDebt(key, who, dk, pk, rec.workedMs);
  syncMonthlyForStaff(pk, key, who);
  saveStaffState(recToRow(key, who, rec));

  const left = Math.max(0, SHIFT_MS - rec.workedMs);
  let msg = `📤 <b>${who}</b> ishdan ketdi\n🕐 ${clock}\n⏱ Bugun ishlangan: <b>${fmtDuration(rec.workedMs)}</b>`;
  if (left > 60_000) msg += `\n📋 Qolgan ish vaqti: <b>${fmtDuration(left)}</b>`;
  else msg += `\n✅ Kunlik mehnat vaqti bajarildi`;
  return msg;
}
