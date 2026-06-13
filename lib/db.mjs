import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { SHIFT_MS, periodKey } from "./period.mjs";

let db;

export function initDb(dataDir) {
  const dir = process.env.DATABASE_DIR || dataDir || "/data";
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "faceid.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_state (
      staff_key TEXT PRIMARY KEY,
      staff_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'out',
      session_start_ms INTEGER,
      last_scan_ms INTEGER DEFAULT 0,
      day_key TEXT NOT NULL DEFAULT '',
      day_worked_ms INTEGER NOT NULL DEFAULT 0,
      had_leave INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS daily_stats (
      day_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      worked_ms INTEGER NOT NULL DEFAULT 0,
      debt_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day_key, staff_key)
    );
    CREATE TABLE IF NOT EXISTS monthly_stats (
      period_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      worked_ms INTEGER NOT NULL DEFAULT 0,
      debt_ms INTEGER NOT NULL DEFAULT 0,
      work_days INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (period_key, staff_key)
    );
    CREATE TABLE IF NOT EXISTS period_meta (
      period_key TEXT PRIMARY KEY,
      closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bot_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_serial (
      serial_no INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS event_fingerprint (
      fp TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
  `);
  try {
    db.prepare("SELECT last_leave_ms FROM staff_state LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE staff_state ADD COLUMN last_leave_ms INTEGER");
  }
  try {
    db.prepare("SELECT first_in_ms FROM staff_state LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE staff_state ADD COLUMN first_in_ms INTEGER");
  }
  console.log("DB:", file);
  return db;
}

export function getDb() {
  if (!db) throw new Error("DB not initialized");
  return db;
}

export function wasSerialProcessed(serial) {
  if (!serial) return false;
  return !!getDb().prepare("SELECT 1 FROM event_serial WHERE serial_no = ?").get(serial);
}

export function markSerial(serial) {
  if (!serial) return;
  getDb().prepare("INSERT OR IGNORE INTO event_serial (serial_no) VALUES (?)").run(serial);
}

export function wasFingerprintProcessed(fp) {
  if (!fp) return false;
  return !!getDb().prepare("SELECT 1 FROM event_fingerprint WHERE fp = ?").get(fp);
}

export function markFingerprint(fp) {
  if (!fp) return;
  getDb()
    .prepare("INSERT OR IGNORE INTO event_fingerprint (fp, created_at) VALUES (?, ?)")
    .run(fp, Date.now());
}

/** Bir skan → bitta xabar (serial yoki staff+vaqt) */
export function claimEvent(ev, staffKey, eventMs) {
  const serial = Number(ev.serialNo || 0);
  return getDb().transaction(() => {
    if (serial) {
      if (wasSerialProcessed(serial)) return false;
      markSerial(serial);
      markFingerprint(`s:${serial}`);
      return true;
    }
    const fp = `k:${staffKey}:${Math.floor(eventMs / 5000)}`;
    if (wasFingerprintProcessed(fp)) return false;
    markFingerprint(fp);
    return true;
  })();
}

export function getStaffState(key) {
  return getDb().prepare("SELECT * FROM staff_state WHERE staff_key = ?").get(key);
}

export function saveStaffState(row) {
  getDb()
    .prepare(
      `INSERT INTO staff_state (staff_key, staff_name, status, session_start_ms, last_scan_ms, day_key, day_worked_ms, had_leave, last_leave_ms, first_in_ms)
       VALUES (@staff_key, @staff_name, @status, @session_start_ms, @last_scan_ms, @day_key, @day_worked_ms, @had_leave, @last_leave_ms, @first_in_ms)
       ON CONFLICT(staff_key) DO UPDATE SET
         staff_name=excluded.staff_name, status=excluded.status, session_start_ms=excluded.session_start_ms,
         last_scan_ms=excluded.last_scan_ms, day_key=excluded.day_key, day_worked_ms=excluded.day_worked_ms,
         had_leave=excluded.had_leave, last_leave_ms=excluded.last_leave_ms, first_in_ms=excluded.first_in_ms`
    )
    .run(row);
}

export function finalizeDayDebt(staffKey, staffName, dk, pk, dayWorkedMs, shiftMs = SHIFT_MS) {
  const debtMs = Math.max(0, shiftMs - dayWorkedMs);
  getDb()
    .prepare(
      `INSERT INTO daily_stats (day_key, period_key, staff_key, staff_name, worked_ms, debt_ms)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(day_key, staff_key) DO UPDATE SET worked_ms=excluded.worked_ms, debt_ms=excluded.debt_ms, staff_name=excluded.staff_name`
    )
    .run(dk, pk, staffKey, staffName, dayWorkedMs, debtMs);
  return debtMs;
}

export function syncMonthlyForStaff(pk, staffKey, staffName) {
  const agg = getDb()
    .prepare(
      `SELECT COALESCE(SUM(worked_ms),0) w, COALESCE(SUM(debt_ms),0) d, COUNT(*) days
       FROM daily_stats WHERE period_key=? AND staff_key=?`
    )
    .get(pk, staffKey);
  getDb()
    .prepare(
      `INSERT INTO monthly_stats (period_key, staff_key, staff_name, worked_ms, debt_ms, work_days)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(period_key, staff_key) DO UPDATE SET
         staff_name=excluded.staff_name, worked_ms=excluded.worked_ms,
         debt_ms=excluded.debt_ms, work_days=excluded.work_days`
    )
    .run(pk, staffKey, staffName, agg.w, agg.d, agg.days);
}

export function getMonthlyForStaff(pk, staffKey) {
  return getDb()
    .prepare(
      "SELECT worked_ms, debt_ms, work_days FROM monthly_stats WHERE period_key=? AND staff_key=?"
    )
    .get(pk, staffKey);
}

export function getMonthlyLeaderboard(pk) {
  return getDb()
    .prepare(
      "SELECT staff_name, worked_ms, debt_ms, work_days FROM monthly_stats WHERE period_key=? AND worked_ms > 0 ORDER BY worked_ms DESC"
    )
    .all(pk);
}

export function getMonthlyDebtors(pk) {
  return getDb()
    .prepare(
      "SELECT staff_name, worked_ms, debt_ms, work_days FROM monthly_stats WHERE period_key=? AND debt_ms > 0 ORDER BY debt_ms DESC"
    )
    .all(pk);
}

export function getTodayDailyStats(dk) {
  return getDb()
    .prepare(
      "SELECT staff_key, staff_name, worked_ms, debt_ms FROM daily_stats WHERE day_key=? ORDER BY staff_name"
    )
    .all(dk);
}

/** Bazada ma'lumot bor kunlar (daily_stats + staff_state) */
export function listDataDays(limit = 40) {
  const d = getDb();
  const fromDaily = d
    .prepare(
      `SELECT day_key, COUNT(*) AS cnt, COALESCE(SUM(worked_ms),0) AS worked_ms
       FROM daily_stats GROUP BY day_key ORDER BY day_key DESC LIMIT ?`
    )
    .all(limit);
  const fromState = d
    .prepare(
      `SELECT day_key, COUNT(*) AS cnt, COALESCE(SUM(day_worked_ms),0) AS worked_ms
       FROM staff_state
       WHERE day_key != '' AND (day_worked_ms > 0 OR status = 'in')
       GROUP BY day_key`
    )
    .all();

  const map = new Map();
  for (const r of fromDaily) {
    map.set(r.day_key, { day_key: r.day_key, cnt: r.cnt, worked_ms: r.worked_ms });
  }
  for (const r of fromState) {
    const prev = map.get(r.day_key);
    if (prev) {
      prev.cnt = Math.max(prev.cnt, r.cnt);
      prev.worked_ms = Math.max(prev.worked_ms, r.worked_ms);
    } else {
      map.set(r.day_key, { day_key: r.day_key, cnt: r.cnt, worked_ms: r.worked_ms });
    }
  }
  return [...map.values()].sort((a, b) => b.day_key.localeCompare(a.day_key)).slice(0, limit);
}

/** Tanlangan kun ma'lumotlarini o'chirish, oylik statistikani qayta hisoblash */
export function deleteDayData(dayKey, employees = { staff: {} }) {
  return getDb().transaction(() => {
    const rows = getDb()
      .prepare(
        "SELECT period_key, staff_key, staff_name FROM daily_stats WHERE day_key=?"
      )
      .all(dayKey);

    getDb().prepare("DELETE FROM daily_stats WHERE day_key=?").run(dayKey);

    const affectedStaff = getDb()
      .prepare("SELECT staff_key, staff_name FROM staff_state WHERE day_key=?")
      .all(dayKey);

    getDb()
      .prepare(
        `UPDATE staff_state SET
           status='out', session_start_ms=NULL, day_worked_ms=0, had_leave=0,
           last_leave_ms=NULL, first_in_ms=NULL, day_key=''
         WHERE day_key=?`
      )
      .run(dayKey);

    const syncSet = new Map();
    for (const r of rows) syncSet.set(`${r.period_key}:${r.staff_key}`, r);
    for (const r of affectedStaff) {
      const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`).getTime());
      const s = employees.staff?.[r.staff_key];
      const name =
        r.staff_name ||
        (s?.firstName && s?.lastName ? `${s.firstName} ${s.lastName}` : r.staff_key);
      syncSet.set(`${pk}:${r.staff_key}`, {
        period_key: pk,
        staff_key: r.staff_key,
        staff_name: name,
      });
    }

    for (const r of syncSet.values()) {
      syncMonthlyForStaff(r.period_key, r.staff_key, r.staff_name || r.staff_key);
    }

    return { dayKey, dailyRows: rows.length, staffRows: affectedStaff.length };
  })();
}

export function isPeriodClosed(pk) {
  return getDb().prepare("SELECT closed FROM period_meta WHERE period_key=?").get(pk)?.closed === 1;
}

export function closePeriod(pk) {
  getDb()
    .prepare(
      "INSERT INTO period_meta (period_key, closed, closed_at) VALUES (?,1,datetime('now')) ON CONFLICT(period_key) DO UPDATE SET closed=1, closed_at=datetime('now')"
    )
    .run(pk);
}

export function getMeta(key) {
  return getDb().prepare("SELECT value FROM bot_meta WHERE key=?").get(key)?.value;
}

export function setMeta(key, value) {
  getDb()
    .prepare("INSERT INTO bot_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, value);
}

export function resetAllAttendance() {
  const d = getDb();
  d.exec(`
    DELETE FROM staff_state;
    DELETE FROM daily_stats;
    DELETE FROM monthly_stats;
    DELETE FROM event_serial;
    DELETE FROM bot_meta WHERE key LIKE 'close_sent_%';
  `);
}

export function shouldRunMonthClose() {
  const d = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", day: "numeric" }).format(new Date())
  );
  if (d !== 2) return null;
  const pk = periodKey();
  if (isPeriodClosed(pk)) return null;
  if (getMeta(`close_sent_${pk}`)) return null;
  return pk;
}
