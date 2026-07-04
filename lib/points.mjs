import {
  pointsEnabled,
  LATE_PENALTY_PER_MIN,
  DEBT_PENALTY_PER_MIN,
  OVERTIME_BONUS_PER_MIN,
  DAILY_PENALTY_CAP,
} from "./points-config.mjs";
import {
  getDailyPointsRow,
  upsertDailyPoints,
  syncMonthlyPoints,
} from "./points-db.mjs";
import { computeDayShiftMetrics } from "./timesheet-metrics.mjs";
import { formatOvertimeLabel } from "./shifts.mjs";
import { hubExtraFromAttendance, pushFaceIdToHub } from "./yordamchi-push.mjs";

function msToMin(ms) {
  return Math.floor(Math.max(0, ms) / 60_000);
}

/** Faqat hisob — DB yoki attendance ga tegmaydi */
export function computeDayPoints({ late_ms = 0, debt_ms = 0, overtime_ms = 0 } = {}) {
  const late_penalty = msToMin(late_ms) * LATE_PENALTY_PER_MIN;
  const debt_penalty = msToMin(debt_ms) * DEBT_PENALTY_PER_MIN;
  const overtime_bonus = msToMin(overtime_ms) * OVERTIME_BONUS_PER_MIN;
  const raw_penalty = late_penalty + debt_penalty;
  const penalty =
    DAILY_PENALTY_CAP > 0 ? Math.min(raw_penalty, DAILY_PENALTY_CAP) : raw_penalty;
  const day_total = overtime_bonus - penalty;
  return {
    late_ms,
    debt_ms,
    overtime_ms,
    late_penalty,
    debt_penalty,
    overtime_bonus,
    day_total,
  };
}

export function formatPointsSigned(n) {
  const v = Number(n) || 0;
  if (v > 0) return `+${v}`;
  return String(v);
}

function pickLateMs(card, prevLateMs = 0) {
  return Math.max(
    prevLateMs,
    card.lateMs || 0,
    card.firstLateMs || 0
  );
}

/** DB ga yozish + card ga ball maydonlari — caption bu yerda emas */
export function applyPointsToCard(card, staff, employees) {
  if (!pointsEnabled() || card?.noShift || !staff) return card;
  try {
    const dk = card.dayKey;
    const pk = card.periodKey;
    const key = card.staffKey;
    const name = card.staffName;
    if (!dk || !pk || !key) return card;

    const prev = getDailyPointsRow(dk, key);
    let late_ms = prev?.late_ms || 0;
    let debt_ms = prev?.debt_ms || 0;
    let overtime_ms = prev?.overtime_ms || 0;
    const prevTotal = prev?.day_total ?? 0;

    if (card.kind === "arrived" || card.kind === "returned") {
      late_ms = pickLateMs(card, late_ms);
    }
    if (card.kind === "left") {
      if (card.firstInMs && card.lastOutMs) {
        const m = computeDayShiftMetrics(staff, key, {
          firstInMs: card.firstInMs,
          lastOutMs: card.lastOutMs,
          workedMs: card.dayWorkedMs,
        });
        late_ms = m.lateMs;
        debt_ms = m.debtMs;
        overtime_ms = m.overtimeMs;
        card.dayDebtMs = m.debtMs;
        card.overtimeMs = m.overtimeMs;
        card.lateMs = m.lateMs;
        card.dayWorkedMs = m.workedMs;
        if (m.overtimeMs > 0) card.overtimeLabel = formatOvertimeLabel(m.overtimeMs);
      } else {
        late_ms = pickLateMs(card, late_ms);
        debt_ms = card.dayDebtMs || 0;
        overtime_ms = card.overtimeMs || 0;
      }
    }

    const computed = computeDayPoints({ late_ms, debt_ms, overtime_ms });
    upsertDailyPoints({
      day_key: dk,
      period_key: pk,
      staff_key: key,
      staff_name: name,
      ...computed,
    });
    syncMonthlyPoints(pk, key, name);

    card.dayPoints = computed.day_total;
    card.pointsBreakdown = computed;
    card.pointsDelta = computed.day_total - prevTotal;

    const tgId = card.telegramId || staff?.telegramId;
    if (tgId) {
      pushFaceIdToHub({
        telegramId: tgId,
        dayKey: dk,
        breakdown: computed,
        extra: hubExtraFromAttendance(card),
      }).then((r) => {
        if (!r.ok) console.warn("hub push:", r.reason);
      });
    }
  } catch (e) {
    console.warn("points apply:", e.message);
  }
  return card;
}

/** @deprecated */
export const enrichCardWithPoints = applyPointsToCard;

export function formatPointsBlock(caption, card) {
  if (card.dayPoints == null) return caption;
  return `${caption}\n📊 ${fmtBold("Ball")}: ${fmtBold(formatPointsSigned(card.dayPoints))}`;
}

function fmtBold(text) {
  return `<b>${text}</b>`;
}
