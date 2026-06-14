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
  getMonthlyPointsTotal,
} from "./points-db.mjs";

function msToMin(ms) {
  return Math.floor(Math.max(0, ms) / 60_000);
}

/** Faqat hisob — DB yoki attendance ga tegmaydi */
export function computeDayPoints({ late_ms = 0, debt_ms = 0, overtime_ms = 0 } = {}) {
  const late_penalty = msToMin(late_ms) * LATE_PENALTY_PER_MIN;
  const debt_penalty = msToMin(debt_ms) * DEBT_PENALTY_PER_MIN;
  const overtime_bonus = msToMin(overtime_ms) * OVERTIME_BONUS_PER_MIN;
  const raw_penalty = late_penalty + debt_penalty;
  const penalty = Math.min(raw_penalty, DAILY_PENALTY_CAP);
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

/** Kartochkaga ball qo'shish — xato bo'lsa attendance buzilmaydi */
export function enrichCardWithPoints(card, staff) {
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

    if (card.kind === "arrived") {
      late_ms = Math.max(late_ms, card.lateMs || 0);
    }
    if (card.kind === "left") {
      debt_ms = card.dayDebtMs || 0;
      overtime_ms += card.overtimeMs || 0;
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
    card.monthPoints = getMonthlyPointsTotal(pk, key);
    card.pointsBreakdown = computed;
    card.caption = appendPointsToCaption(card.caption, card);
  } catch (e) {
    console.warn("points enrich:", e.message);
  }
  return card;
}

function appendPointsToCaption(caption, card) {
  if (card.dayPoints == null) return caption;
  let line = `\n📊 ${fmtBold("Ball")}: ${fmtBold(`bugun ${formatPointsSigned(card.dayPoints)}`)}`;
  if (card.monthPoints != null) {
    line += ` · ${fmtBold(`oy ${formatPointsSigned(card.monthPoints)}`)}`;
  }
  const b = card.pointsBreakdown;
  if (b && (b.late_penalty || b.debt_penalty || b.overtime_bonus)) {
    const parts = [];
    if (b.late_penalty) parts.push(`⏰ −${b.late_penalty}`);
    if (b.debt_penalty) parts.push(`💰 −${b.debt_penalty}`);
    if (b.overtime_bonus) parts.push(`💪 +${b.overtime_bonus}`);
    if (parts.length) line += `\n<i>${parts.join(" · ")}</i>`;
  }
  return `${caption}${line}`;
}

function fmtBold(text) {
  return `<b>${text}</b>`;
}
