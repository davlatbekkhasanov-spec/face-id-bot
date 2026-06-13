import { fmtDuration, periodLabel, SHIFT_MS, dayKey } from "./period.mjs";
import { formatShiftLabel } from "./shifts.mjs";

function shiftMs(card) {
  return card.shiftMs || SHIFT_MS;
}

function mention(name, telegramId) {
  if (telegramId) {
    return `<a href="tg://user?id=${telegramId}">${name}</a>`;
  }
  return `<b>${name}</b>`;
}

const KIND_LABEL = {
  arrived: "ИШГА КЕЛДИ",
  returned: "ЯНА ИШГА КЕЛДИ",
  left: "ИШДАН КЕТДИ",
};

const KIND_ICON = {
  arrived: "📥",
  returned: "🔄",
  left: "📤",
};

function preTable(rows) {
  const width = Math.max(...rows.map((r) => r.length), 0);
  const pad = (s, w) => String(s).padEnd(w);
  const top = "┏" + "━".repeat(width + 2) + "┓";
  const mid = rows.map((r) => "┃ " + pad(r, width) + " ┃");
  const bottom = "┗" + "━".repeat(width + 2) + "┛";
  return "<pre>" + [top, ...mid, bottom].join("\n") + "</pre>";
}

/** 1-xabar: rasm ostidagi qisqa sarlavha */
export function formatShortCaption(card) {
  const who = mention(card.staffName, card.telegramId);
  const label = KIND_LABEL[card.kind] || "HODISA";
  const icon = KIND_ICON[card.kind] || "📌";
  const shift =
    !card.noShift &&
    (card.shiftLabel ||
      (card.shiftStart && card.shiftHours
        ? `${card.shiftStart} — ${card.shiftEnd || "?"} (${card.shiftHours} soat)`
        : null));
  let text = `${icon} <b>${label}</b>\n👤 ${who}\n🕐 ${card.clock}`;
  if (shift) text += `\n📋 Smena: <b>${shift}</b>`;
  if (card.lateMs > 0 && card.lateLabel) {
    text += `\n⏰ Кечикди: <b>${card.lateLabel}</b>`;
  }
  if (card.earlyMs > 0 && card.earlyLabel) {
    text += `\n⏳ Vaqtidan oldin: <b>${card.earlyLabel}</b>`;
  }
  if (card.overtimeMs > 0 && card.overtimeLabel) {
    text += `\n💪 Ko'p ishlagan: <b>${card.overtimeLabel}</b>`;
  }
  return text;
}

/** 2-xabar: ping jadval — yordamchi «ochko jadvali» kabi tafsilot */
export function formatPingBreakdown(card) {
  const who = mention(card.staffName, card.telegramId);
  const month = periodLabel(card.periodKey);
  const sm = shiftMs(card);
  const dayLeft = Math.max(0, sm - card.dayWorkedMs);
  const label = KIND_LABEL[card.kind] || "HODISA";
  const dayIso = card.dayKey || dayKey();

  const rows = [
    "Кўрсаткич            │ Қиймат",
    "─────────────────────┼──────────────────",
    `Ҳолат                │ ${label}`,
    `Кунлик меъёр        │ ${fmtDuration(sm)}`,
    `Бугун ишланган      │ ${fmtDuration(card.dayWorkedMs)}`,
  ];

  if (dayLeft > 60_000) {
    rows.push(
      `Кунлик қарз          │ ${fmtDuration(dayLeft)}`,
      `Ҳисоблаш            │ ${fmtDuration(sm)} − ${fmtDuration(card.dayWorkedMs)}`
    );
  } else {
    rows.push("Кунлик қарз          │ ✓ (меъёр бажарилди)");
  }

  rows.push(
    "─────────────────────┼──────────────────",
    `Oy (${month})`,
    `Жами ишланган       │ ${fmtDuration(card.monthWorkedMs)}`,
    `Умумий қарз          │ ${fmtDuration(card.monthDebtMs)}`,
    `Иш кунлари          │ ${card.workDays}`
  );

  if (card.kind !== "left" && card.status === "in") {
    rows.push(`Ҳолат               │ Ҳозир ишда`);
  }

  return (
    `📊 <b>ИШ ВАҚТИ ЖАДВАЛИ</b>\n` +
    `👤 ${who} · ${dayIso} · ${card.clock}\n\n` +
    preTable(rows)
  );
}

/** @deprecated — formatShortCaption + formatPingBreakdown ishlatiladi */
export function formatGroupCaption(card) {
  return formatShortCaption(card);
}
