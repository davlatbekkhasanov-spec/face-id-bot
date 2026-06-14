/** Ball tizimi — env orqali o'chirish mumkin (POINTS_ENABLED=0) */

export function pointsEnabled() {
  const v = String(process.env.POINTS_ENABLED ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export const LATE_PENALTY_PER_MIN = Math.max(0, Number(process.env.POINTS_LATE_PENALTY || 1));
export const DEBT_PENALTY_PER_MIN = Math.max(0, Number(process.env.POINTS_DEBT_PENALTY || 1));
export const OVERTIME_BONUS_PER_MIN = Math.max(0, Number(process.env.POINTS_OVERTIME_BONUS || 2));
/** 0 = kunlik jarima cheklovi yo'q; >0 = maksimum jarima (ball) */
export const DAILY_PENALTY_CAP = Math.max(0, Number(process.env.POINTS_DAILY_PENALTY_CAP ?? 0));
