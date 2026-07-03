/** Face ID ball → yordamchi hub (period reyting) */

const DEFAULT_HUB = "https://davlat-yordamchi-bot-production.up.railway.app";

export function hubConfigured() {
  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB).trim();
  const secret = (process.env.YORDAMCHI_HUB_SECRET || process.env.HUB_SECRET || "").trim();
  return Boolean(url && secret);
}

export function hubStatusLabel() {
  if (!hubConfigured()) return "hub: SECRET yo'q (yordamchi reyting ishlamaydi)";
  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB).trim();
  return `hub: OK → ${url.replace(/^https?:\/\//, "").split("/")[0]}`;
}

export function buildFaceIdHubSummary(breakdown, extra = {}) {
  const b = breakdown || {};
  const x = extra || {};
  const dayTotal = Number(b.day_total) || 0;
  const late = Number(b.late_penalty) || 0;
  const debt = Number(b.debt_penalty) || 0;
  const bonus = Number(b.overtime_bonus) || 0;
  const parts = [`ball=${dayTotal}`, `kech=${late}`, `qarz=${debt}`, `bonus=${bonus}`];
  if (x.keldi) parts.push(`keldi=${x.keldi}`);
  if (x.ketdi) parts.push(`ketdi=${x.ketdi}`);
  if (Number.isFinite(x.ish_daq) && x.ish_daq >= 0) parts.push(`ish_daq=${x.ish_daq}`);
  if (Number.isFinite(x.qarz_oy_daq) && x.qarz_oy_daq >= 0) {
    parts.push(`qarz_oy_daq=${x.qarz_oy_daq}`);
  }
  return `Face ID: ${parts.join(" ")}`;
}

export function hubExtraFromAttendance(card = {}) {
  const extra = {};
  if (card.firstInClock) extra.keldi = card.firstInClock;
  else if (card.kind === "arrived" && card.clock) extra.keldi = card.clock;
  if (card.kind === "left" && card.clock) extra.ketdi = card.clock;
  if (Number.isFinite(card.dayWorkedMs)) {
    extra.ish_daq = Math.floor(Math.max(0, card.dayWorkedMs) / 60_000);
  }
  if (Number.isFinite(card.monthDebtMs)) {
    extra.qarz_oy_daq = Math.floor(Math.max(0, card.monthDebtMs) / 60_000);
  }
  return extra;
}

const EMPTY_BREAKDOWN = {
  day_total: 0,
  late_penalty: 0,
  debt_penalty: 0,
  overtime_bonus: 0,
  late_ms: 0,
  debt_ms: 0,
  overtime_ms: 0,
};

/** Smenasiz hodimlar — hub va keyin tiklash uchun */
export async function pushNoShiftAttendanceToHub(card, staff) {
  if (!card?.noShift || !card?.dayKey) return { ok: false, reason: "noShift emas" };
  const tgId = card.telegramId || staff?.telegramId;
  if (!tgId) return { ok: false, reason: "telegramId yo'q" };
  if (card.kind !== "left") return { ok: false, reason: "faqat ketdi" };
  return pushFaceIdToHub({
    telegramId: tgId,
    dayKey: card.dayKey,
    breakdown: EMPTY_BREAKDOWN,
    extra: hubExtraFromAttendance(card),
  });
}

export async function pushFaceIdToHub({ telegramId, dayKey, breakdown, extra = {} }) {
  if (!telegramId) return { ok: false, reason: "telegramId yo'q" };
  if (!hubConfigured()) return { ok: false, reason: "hub sozlanmagan" };

  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB)
    .trim()
    .replace(/\/$/, "");
  const secret = (process.env.YORDAMCHI_HUB_SECRET || process.env.HUB_SECRET || "").trim();
  const summary = buildFaceIdHubSummary(breakdown, extra);
  const payload = {
    tg_id: Number(telegramId),
    bot_key: "faceid",
    summary,
    day: dayKey,
  };

  try {
    const res = await fetch(`${url}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Secret": secret,
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.message || res.statusText };
    }
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** Bugungi barcha hodimlar — deploy/keyingi sync */
export async function syncTodayPointsToHub(employees) {
  if (!hubConfigured()) return { ok: false, pushed: 0 };
  const { dayKey } = await import("./period.mjs");
  const { listDailyPointsForDay } = await import("./points-db.mjs");
  const { getStaffState, getMonthlyForStaff } = await import("./db.mjs");
  const { periodKey } = await import("./period.mjs");
  const { fmtClockMs } = await import("./attendance-core.mjs");
  const dk = dayKey();
  const pk = periodKey();
  const rows = listDailyPointsForDay(dk);
  let pushed = 0;
  for (const row of rows) {
    const tg = employees.staff?.[row.staff_key]?.telegramId;
    if (!tg) continue;
    const st = getStaffState(row.staff_key);
    const month = getMonthlyForStaff(pk, row.staff_key);
    const extra = {};
    if (st?.first_in_ms) extra.keldi = fmtClockMs(st.first_in_ms);
    if (st?.last_leave_ms && st.status === "out") extra.ketdi = fmtClockMs(st.last_leave_ms);
    if (st?.day_worked_ms != null) {
      extra.ish_daq = Math.floor(Math.max(0, st.day_worked_ms) / 60_000);
    }
    if (month?.debt_ms != null) {
      extra.qarz_oy_daq = Math.floor(Math.max(0, month.debt_ms) / 60_000);
    }
    const r = await pushFaceIdToHub({
      telegramId: tg,
      dayKey: dk,
      breakdown: row,
      extra,
    });
    if (r.ok) pushed += 1;
  }
  return { ok: true, pushed };
}
