import { listStaffDataDays, resetStaffDayData } from "./db.mjs";
import { fmtDayHuman } from "./admin-report-data.mjs";
import { fmtDurationNorm } from "./period.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";

export function staffResetDayLabel(day) {
  const human = fmtDayHuman(day.day_key);
  const parts = [];
  if (day.worked_ms > 0) parts.push(fmtDurationNorm(day.worked_ms));
  if (day.day_total) parts.push(`${day.day_total > 0 ? "+" : ""}${day.day_total} ball`);
  if (day.in_now) parts.push("ishda");
  const extra = parts.length ? ` · ${parts.join(" · ")}` : "";
  return `📅 ${human}${extra}`;
}

export function buildStaffResetDayKeyboard(days) {
  const rows = [];
  for (let i = 0; i < days.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, days.length); j++) {
      row.push({ text: staffResetDayLabel(days[j]) });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Bekor" }]);
  return { keyboard: rows, resize_keyboard: true };
}

export function staffResetConfirmKeyboard() {
  return {
    keyboard: [[{ text: "✅ Ha, tozalash" }], [{ text: "❌ Bekor" }]],
    resize_keyboard: true,
  };
}

export function startStaffResetIntro(staffKey, employees) {
  const s = employees.staff?.[staffKey];
  const name = s ? staffReplyLabel(s) : staffKey;
  return (
    `🧪 <b>Test tozalash</b>\n` +
    `👤 <b>${name}</b>\n\n` +
    `Faqat shu hodimning tanlangan kuni o'chiriladi:\n` +
    `• keldi/ketdi holati\n` +
    `• vaqt va qarz\n` +
    `• ball\n\n` +
    `Boshqa hodimlar va kunlar tegilmaydi.`
  );
}

export function staffResetConfirmText(staffKey, dayKey, employees) {
  const s = employees.staff?.[staffKey];
  const name = s ? staffReplyLabel(s) : staffKey;
  return (
    `⚠️ <b>Tasdiqlang</b>\n\n` +
    `👤 ${name}\n` +
    `📅 ${fmtDayHuman(dayKey)}\n\n` +
    `Shu hodimning shu kunidagi test ma'lumotlari o'chiriladi.`
  );
}

export function performStaffDayReset(staffKey, dayKey, employees) {
  return resetStaffDayData(staffKey, dayKey, employees);
}

export { listStaffDataDays };
