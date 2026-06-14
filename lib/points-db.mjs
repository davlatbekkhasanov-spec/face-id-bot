import { getDb } from "./db.mjs";

export function initPointsSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS daily_points (
      day_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL DEFAULT '',
      late_ms INTEGER NOT NULL DEFAULT 0,
      debt_ms INTEGER NOT NULL DEFAULT 0,
      overtime_ms INTEGER NOT NULL DEFAULT 0,
      late_penalty INTEGER NOT NULL DEFAULT 0,
      debt_penalty INTEGER NOT NULL DEFAULT 0,
      overtime_bonus INTEGER NOT NULL DEFAULT 0,
      day_total INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day_key, staff_key)
    );
    CREATE TABLE IF NOT EXISTS monthly_points (
      period_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL DEFAULT '',
      total_points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (period_key, staff_key)
    );
  `);
}

export function getDailyPointsRow(dayKey, staffKey) {
  return getDb()
    .prepare("SELECT * FROM daily_points WHERE day_key=? AND staff_key=?")
    .get(dayKey, staffKey);
}

export function upsertDailyPoints(row) {
  getDb()
    .prepare(
      `INSERT INTO daily_points (
         day_key, period_key, staff_key, staff_name,
         late_ms, debt_ms, overtime_ms,
         late_penalty, debt_penalty, overtime_bonus, day_total
       ) VALUES (
         @day_key, @period_key, @staff_key, @staff_name,
         @late_ms, @debt_ms, @overtime_ms,
         @late_penalty, @debt_penalty, @overtime_bonus, @day_total
       )
       ON CONFLICT(day_key, staff_key) DO UPDATE SET
         period_key=excluded.period_key,
         staff_name=excluded.staff_name,
         late_ms=excluded.late_ms,
         debt_ms=excluded.debt_ms,
         overtime_ms=excluded.overtime_ms,
         late_penalty=excluded.late_penalty,
         debt_penalty=excluded.debt_penalty,
         overtime_bonus=excluded.overtime_bonus,
         day_total=excluded.day_total`
    )
    .run(row);
}

export function syncMonthlyPoints(periodKey, staffKey, staffName) {
  const agg = getDb()
    .prepare(
      `SELECT COALESCE(SUM(day_total),0) AS total
       FROM daily_points WHERE period_key=? AND staff_key=?`
    )
    .get(periodKey, staffKey);
  getDb()
    .prepare(
      `INSERT INTO monthly_points (period_key, staff_key, staff_name, total_points)
       VALUES (?,?,?,?)
       ON CONFLICT(period_key, staff_key) DO UPDATE SET
         staff_name=excluded.staff_name,
         total_points=excluded.total_points`
    )
    .run(periodKey, staffKey, staffName, agg?.total || 0);
}

export function getMonthlyPointsTotal(periodKey, staffKey) {
  return (
    getDb()
      .prepare("SELECT total_points FROM monthly_points WHERE period_key=? AND staff_key=?")
      .get(periodKey, staffKey)?.total_points ?? 0
  );
}

export function getMonthlyPointsLeaderboard(periodKey, limit = 20) {
  return getDb()
    .prepare(
      `SELECT staff_key, staff_name, total_points
       FROM monthly_points WHERE period_key=?
       ORDER BY total_points DESC, staff_name ASC
       LIMIT ?`
    )
    .all(periodKey, limit);
}

export function listDailyPointsForDay(dayKey) {
  return getDb()
    .prepare(
      `SELECT staff_key, staff_name, day_total, late_penalty, debt_penalty, overtime_bonus
       FROM daily_points WHERE day_key=?`
    )
    .all(dayKey);
}

export function deleteDayPoints(dayKey) {
  return getDb().prepare("DELETE FROM daily_points WHERE day_key=?").run(dayKey).changes;
}

export function resetAllPoints() {
  const d = getDb();
  d.exec("DELETE FROM daily_points; DELETE FROM monthly_points;");
}
