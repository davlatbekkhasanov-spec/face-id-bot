import { getDb, syncMonthlyForStaff } from "./db.mjs";
import { periodKey } from "./period.mjs";
import { fmtDurationNorm, fmtHoursShort } from "./period.mjs";
import { fmtClockMs } from "./attendance-core.mjs";
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

/** Kun uchun mavjud keldi/ketdi (daily_stats + log) */
export function getDayTimesSnapshot(staffKey, dayKey) {
  const db = getDb();
  const ds = db
    .prepare(
      `SELECT first_in_ms, last_out_ms FROM daily_stats WHERE staff_key=? AND day_key=?`
    )
    .get(staffKey, dayKey);
  const log = db
    .prepare(
      `SELECT
         MIN(CASE WHEN kind IN ('arrived','returned') THEN COALESCE(first_in_ms, event_ms) END) AS first_in_ms,
         MAX(CASE WHEN kind = 'left' THEN COALESCE(last_out_ms, event_ms) END) AS last_out_ms
       FROM attendance_log WHERE staff_key=? AND day_key=?`
    )
    .get(staffKey, dayKey);

  const firstInMs = ds?.first_in_ms || log?.first_in_ms || null;
  const lastOutMs = ds?.last_out_ms || log?.last_out_ms || null;

  return {
    firstInMs,
    lastOutMs,
    keldi: firstInMs ? fmtClockMs(firstInMs) : null,
    ketdi: lastOutMs ? fmtClockMs(lastOutMs) : null,
    hasKeldi: Boolean(firstInMs),
    hasKetdi: Boolean(lastOutMs),
  };
}

/** Kun tanlangandan keyin — faqat yetishmayotgan vaqt so'raladi */
export function startFixDayTimeState(staffKey, dayKey) {
  const snap = getDayTimesSnapshot(staffKey, dayKey);
  if (snap.hasKeldi && snap.hasKetdi) {
    return { complete: true, snap };
  }
  return {
    complete: false,
    snap,
    keldi: snap.keldi,
    ketdi: snap.ketdi,
    ask: snap.hasKeldi ? "ketdi" : "keldi",
  };
}

export function buildFixDayTimePrompt(staffName, dayKey, state) {
  const head =
    `📝 <b>Kun kiritish</b>\n👤 ${staffName}\n📅 ${fmtDayHuman(dayKey)}\n\n`;

  if (state.ask === "ketdi") {
    return (
      head +
      `📥 Keldi: <b>${state.keldi}</b> (bazada bor)\n\n` +
      `4️⃣ <b>Ketdi</b> vaqtini yuboring:\n<code>21:00</code>`
    );
  }
  if (state.ketdi) {
    return (
      head +
      `📤 Ketdi: <b>${state.ketdi}</b> (bazada bor)\n\n` +
      `4️⃣ <b>Keldi</b> vaqtini yuboring:\n<code>09:15</code>`
    );
  }
  return head + `4️⃣ <b>Keldi</b> vaqtini yuboring:\n<code>09:15</code>`;
}

export function buildFixDayCompleteMessage(staffName, dayKey, snap) {
  return (
    `ℹ️ <b>To'liq ma'lumot bor</b>\n👤 ${staffName}\n📅 ${fmtDayHuman(dayKey)}\n` +
    `📥 Keldi: <b>${snap.keldi}</b> · 📤 Ketdi: <b>${snap.ketdi}</b>\n\n` +
    `<i>O'zgartirish kerak bo'lsa — hodim menyusidan «Test tozalash»</i>`
  );
}

/** Yetishmayotgan keldi/ketdi — mavjud vaqt saqlanadi */
export function saveManualDayKeldiKetdi(staffKey, staffName, dayKey, keldiHHMM, ketdiHHMM, employees) {
  const snap = getDayTimesSnapshot(staffKey, dayKey);
  const keldi = normHHMM(keldiHHMM) || snap.keldi;
  const ketdi = normHHMM(ketdiHHMM) || snap.ketdi;
  if (!keldi || !ketdi) {
    return { ok: false, error: "Keldi va ketdi ikkalasi ham kerak" };
  }

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
