import { finalizeDayDebt, getDb, getStaffState, syncMonthlyForStaff } from "./db.mjs";
import { periodKey } from "./period.mjs";
import { shiftMsFor, hasShiftTracking } from "./shifts.mjs";

export function initAbsenceSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS day_absence (
      day_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      alert_sent INTEGER NOT NULL DEFAULT 0,
      message_id INTEGER,
      resolved_at INTEGER,
      PRIMARY KEY (day_key, staff_key)
    );
    CREATE INDEX IF NOT EXISTS idx_day_absence_day ON day_absence(day_key);
  `);
}

export function getAbsence(dayKey, staffKey) {
  return getDb()
    .prepare(`SELECT * FROM day_absence WHERE day_key=? AND staff_key=?`)
    .get(dayKey, staffKey);
}

export function staffArrivedToday(staffKey, dayKey) {
  const st = getStaffState(staffKey);
  if (st?.day_key === dayKey && st?.first_in_ms) return true;
  const ds = getDb()
    .prepare(
      `SELECT first_in_ms, worked_ms FROM daily_stats WHERE day_key=? AND staff_key=?`
    )
    .get(dayKey, staffKey);
  if (ds?.first_in_ms || (ds?.worked_ms || 0) > 0) return true;
  const log = getDb()
    .prepare(
      `SELECT 1 FROM attendance_log
       WHERE day_key=? AND staff_key=? AND kind IN ('arrived','returned')
       LIMIT 1`
    )
    .get(dayKey, staffKey);
  return !!log;
}

export function wasAbsenceAlertSent(dayKey, staffKey) {
  const row = getAbsence(dayKey, staffKey);
  return Boolean(row?.alert_sent);
}

export function markAbsenceAlertSent(dayKey, staffKey, staffName, messageId) {
  getDb()
    .prepare(
      `INSERT INTO day_absence (day_key, staff_key, staff_name, status, alert_sent, message_id)
       VALUES (?,?,?,'pending',1,?)
       ON CONFLICT(day_key, staff_key) DO UPDATE SET
         alert_sent=1, message_id=excluded.message_id, staff_name=excluded.staff_name`
    )
    .run(dayKey, staffKey, staffName, messageId || null);
}

export function setAbsenceResolved(dayKey, staffKey, staffName, status) {
  getDb()
    .prepare(
      `INSERT INTO day_absence (day_key, staff_key, staff_name, status, alert_sent, resolved_at)
       VALUES (?,?,?,?,1,?)
       ON CONFLICT(day_key, staff_key) DO UPDATE SET
         status=excluded.status, staff_name=excluded.staff_name, resolved_at=excluded.resolved_at`
    )
    .run(dayKey, staffKey, staffName, status, Date.now());
}

/** Face ID yoki qo'lda keldi — sababsiz/входной bekor, ish vaqti yoziladi */
export function clearAbsenceIfArrived(staffKey, dayKey, staffName = "") {
  const row = getAbsence(dayKey, staffKey);
  if (!row) return false;
  const wasUnexcused = row.status === "unexcused";
  if (wasUnexcused) {
    getDb()
      .prepare(`DELETE FROM daily_stats WHERE day_key=? AND staff_key=? AND worked_ms=0`)
      .run(dayKey, staffKey);
    const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
    syncMonthlyForStaff(pk, staffKey, staffName || row.staff_name || staffKey);
  }
  getDb()
    .prepare(`DELETE FROM day_absence WHERE day_key=? AND staff_key=?`)
    .run(dayKey, staffKey);
  return true;
}

export function applyExcusedAbsence(dayKey, staffKey, staffName) {
  setAbsenceResolved(dayKey, staffKey, staffName, "excused");
}

export function applyUnexcusedAbsence(dayKey, staffKey, staffName, employees) {
  const staff = employees.staff?.[staffKey];
  if (!staff || !hasShiftTracking(staff)) {
    setAbsenceResolved(dayKey, staffKey, staffName, "unexcused");
    return;
  }
  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
  finalizeDayDebt(staffKey, staffName, dayKey, pk, 0, shiftMsFor(staff), {
    firstInMs: null,
    lastOutMs: null,
  });
  syncMonthlyForStaff(pk, staffKey, staffName);
  setAbsenceResolved(dayKey, staffKey, staffName, "unexcused");
}

/** @returns {Map<string, 'excused'|'unexcused'>} key = staffKey:dayKey */
export function getAbsenceMarksInRange(fromKey, toKey) {
  const rows = getDb()
    .prepare(
      `SELECT day_key, staff_key, status FROM day_absence
       WHERE day_key >= ? AND day_key <= ? AND status IN ('excused','unexcused')`
    )
    .all(fromKey, toKey);
  const map = new Map();
  for (const r of rows) {
    map.set(`${r.staff_key}:${r.day_key}`, r.status);
  }
  return map;
}

export function countUnexcusedInRange(staffKey, fromKey, toKey) {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM day_absence
       WHERE staff_key=? AND day_key >= ? AND day_key <= ? AND status='unexcused'`
    )
    .get(staffKey, fromKey, toKey);
  return row?.c || 0;
}
