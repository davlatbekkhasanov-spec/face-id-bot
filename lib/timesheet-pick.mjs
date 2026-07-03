import { listTimesheetMonths } from "./db.mjs";
import { daysInCalendarMonth, monthLabel } from "./period.mjs";

export const TABEL_BACK = "◀️ Orqaga";

export function monthPickLabel(ym) {
  return `📅 ${monthLabel(ym)}`;
}

export function buildMonthPickKeyboard() {
  const months = listTimesheetMonths(10);
  const monthMap = {};
  const rows = [];
  for (let i = 0; i < months.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, months.length); j++) {
      const ym = months[j];
      const label = monthPickLabel(ym);
      monthMap[label] = ym;
      row.push({ text: label });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Bekor" }]);
  return { keyboard: rows, resize_keyboard: true, monthMap };
}

export function buildDayPickKeyboard(ym) {
  const max = daysInCalendarMonth(ym);
  const dayMap = {};
  const rows = [];
  let row = [];
  for (let d = 1; d <= max; d++) {
    const label = String(d);
    dayMap[label] = d;
    row.push({ text: label });
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: "❌ Bekor" }]);
  rows.push([{ text: TABEL_BACK }]);
  return { keyboard: rows, resize_keyboard: true, dayMap };
}

export function startTabelPickMessage() {
  return (
    "📋 <b>TABEL (Excel)</b>\n\n" +
    "1️⃣ <b>Oyni</b> tanlang\n" +
    "2️⃣ <b>Boshlanish kunini</b> tanlang (1—31)\n" +
    "3️⃣ <b>Tugash kunini</b> tanlang (1—31)"
  );
}

/** Telegram reply_markup (monthMap/dayMap ni ajratib) */
export function pickReplyMarkup(pick) {
  return { keyboard: pick.keyboard, resize_keyboard: true };
}
