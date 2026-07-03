import { listTimesheetMonths } from "./db.mjs";
import { dayKey, dayKeyFromParts, daysInCalendarMonth, monthLabel } from "./period.mjs";

export const TABEL_PRESET_LABELS = {
  AVANS: "💰 Avans (1—17)",
  OYLIK: "📆 Oylik (3—2)",
  FULL: "📅 Butun oy",
  CUSTOM: "✏️ Boshqa oralik",
};

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

function prevMonthYm(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  let pm = m - 1;
  let py = y;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function capToToday(toKey) {
  const today = dayKey();
  return toKey > today ? today : toKey;
}

/** Avans 1—17 · Oylik oldingi oy 3 — tanlangan oy 2 */
export function resolveTabelPreset(ym, presetKey) {
  if (presetKey === "avans") {
    return {
      fromKey: dayKeyFromParts(ym, 1),
      toKey: capToToday(dayKeyFromParts(ym, 17)),
    };
  }
  if (presetKey === "oylik") {
    const prev = prevMonthYm(ym);
    return {
      fromKey: dayKeyFromParts(prev, 3),
      toKey: capToToday(dayKeyFromParts(ym, 2)),
    };
  }
  if (presetKey === "full") {
    const max = daysInCalendarMonth(ym);
    return {
      fromKey: dayKeyFromParts(ym, 1),
      toKey: capToToday(dayKeyFromParts(ym, max)),
    };
  }
  return null;
}

export function buildPresetPickKeyboard() {
  const presetMap = {
    [TABEL_PRESET_LABELS.AVANS]: "avans",
    [TABEL_PRESET_LABELS.OYLIK]: "oylik",
    [TABEL_PRESET_LABELS.FULL]: "full",
    [TABEL_PRESET_LABELS.CUSTOM]: "custom",
  };
  const keyboard = [
    [{ text: TABEL_PRESET_LABELS.AVANS }],
    [{ text: TABEL_PRESET_LABELS.OYLIK }],
    [{ text: TABEL_PRESET_LABELS.FULL }],
    [{ text: TABEL_PRESET_LABELS.CUSTOM }],
    [{ text: "❌ Bekor" }],
  ];
  return { keyboard, resize_keyboard: true, presetMap };
}

export function presetPickMessage(ym) {
  const prev = prevMonthYm(ym);
  return (
    `📋 <b>TABEL</b>\n\n` +
    `📅 ${monthPickLabel(ym)}\n\n` +
    `2️⃣ <b>Davrni</b> tanlang:\n` +
    `· <b>Avans</b> — 1—17 (${monthLabel(ym)})\n` +
    `· <b>Oylik</b> — 3 ${monthLabel(prev)} → 2 ${monthLabel(ym)}\n` +
    `· <b>Butun oy</b> yoki qo'lda oralik`
  );
}

export function buildDayPickKeyboard(ym, { title = "Kun" } = {}) {
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
  return { keyboard: rows, resize_keyboard: true, dayMap, title };
}

export function startTabelPickMessage() {
  return (
    "📋 <b>TABEL (Excel)</b>\n\n" +
    "1️⃣ <b>Oyni</b> tanlang\n" +
    "2️⃣ <b>Avans / Oylik</b> yoki boshqa davr\n" +
    "3️⃣ Qo'lda — bosh va tugash kuni (1—31)\n\n" +
    "💡 <b>Avans</b> — har oy 17 · <b>Oylik</b> — har oy 2"
  );
}

/** Telegram reply_markup (monthMap/dayMap ni ajratib) */
export function pickReplyMarkup(pick) {
  return { keyboard: pick.keyboard, resize_keyboard: true };
}
