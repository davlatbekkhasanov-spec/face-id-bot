import { getDb, syncMonthlyForStaff } from "./db.mjs";
import { periodKey } from "./period.mjs";
import { fmtDurationNorm, fmtHoursShort } from "./period.mjs";
import { computeDayShiftMetrics, applyDayShiftMetrics } from "./timesheet-metrics.mjs";
import { fmtDayHuman } from "./admin-report-data.mjs";

function msOnDay(dayKey, clockHHMM) {
  const m = String(clockHHMM || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  return new Date(`${dayKey}T${hh}:${m[2]}:00+05:00`).getTime();
}

function normHHMM(text) {
  const m = String(text || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1])}:${m[2]}`;
}

/** Face ID dan qolib ketgan kun — keldi + ketdi qo'lda */
export function saveManualDayKeldiKetdi(staffKey, staffName, dayKey, keldiHHMM, ketdiHHMM, employees) {
  const keldi = normHHMM(keldiHHMM);
  const ketdi = normHHMM(ketdiHHMM);
  if (!keldi || !ketdi) return { ok: false, error: "Vaqt formati: HH:MM (masalan 09:15)" };

  const firstInMs = msOnDay(dayKey, keldi);
  const lastOutMs = msOnDay(dayKey, ketdi);
  if (!firstInMs || !lastOutMs) return { ok: false, error: "Kun yoki vaqt noto'g'ri" };
  if (lastOutMs <= firstInMs) {
    return { ok: false, error: "Ketdi vaqti keldi dan keyin bo'lishi kerak" };
  }

  const staff = employees.staff?.[staffKey];
  if (!staff) return { ok: false, error: "Hodim topilmadi" };

  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
  const metrics = computeDayShiftMetrics(staff, staffKey, {
    firstInMs,
    lastOutMs,
    workedMs: 0,
  });

  const db = getDb();
  db.prepare(`DELETE FROM attendance_log WHERE staff_key=? AND day_key=?`).run(staffKey, dayKey);

  const ins = db.prepare(
    `INSERT INTO attendance_log
     (day_key, period_key, staff_key, staff_name, kind, event_ms, worked_ms, first_in_ms, last_out_ms, logged_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const now = Date.now();
  ins.run(dayKey, pk, staffKey, staffName, "arrived", firstInMs, 0, firstInMs, null, now);
  ins.run(
    dayKey,
    pk,
    staffKey,
    staffName,
    "left",
    lastOutMs,
    metrics.workedMs,
    firstInMs,
    lastOutMs,
    now
  );

  applyDayShiftMetrics(
    staffKey,
    staffName,
    dayKey,
    { ...metrics, firstInMs, lastOutMs },
    employees
  );
  syncMonthlyForStaff(pk, staffKey, staffName);

  return {
    ok: true,
    keldi,
    ketdi,
    workedMs: metrics.workedMs,
    lateMs: metrics.lateMs,
    debtMs: metrics.debtMs,
    overtimeMs: metrics.overtimeMs,
  };
}

export function formatManualDaySavedMessage(result, staffName, dk) {
  const minus = (result.lateMs || 0) + (result.debtMs || 0);
  return (
    `✅ <b>Saqlandi</b>\n👤 ${staffName}\n📅 ${fmtDayHuman(dk)}\n` +
    `📥 ${result.keldi} → 📤 ${result.ketdi}\n` +
    `⏱ Ish: <b>${fmtDurationNorm(result.workedMs)}</b>\n` +
    `Minus: ${fmtHoursShort(minus)} · Plus: ${fmtHoursShort(result.overtimeMs || 0)}`
  );
}

export { normHHMM };
