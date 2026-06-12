import { fmtDuration, periodLabel, SHIFT_MS, dayKey } from "./period.mjs";

function mention(name, telegramId) {
  if (telegramId) {
    return `<a href="tg://user?id=${telegramId}">${name}</a>`;
  }
  return `<b>${name}</b>`;
}

const KIND_LABEL = {
  arrived: "ISHGA KELDI",
  returned: "YANA ISHGA QAYTDI",
  left: "ISHDAN KETDI",
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

/** 1-xabar: rasm ostidagi qisqa sarlavha (yordamchi PNG caption kabi) */
export function formatShortCaption(card) {
  const who = mention(card.staffName, card.telegramId);
  const label = KIND_LABEL[card.kind] || "HODISA";
  const icon = KIND_ICON[card.kind] || "📌";
  return `${icon} <b>${label}</b>\n👤 ${who}\n🕐 ${card.clock}`;
}

/** 2-xabar: ping jadval — yordamchi «ochko jadvali» kabi tafsilot */
export function formatPingBreakdown(card) {
  const who = mention(card.staffName, card.telegramId);
  const month = periodLabel(card.periodKey);
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const label = KIND_LABEL[card.kind] || "HODISA";
  const dayIso = card.dayKey || dayKey();

  const rows = [
    "Ko'rsatkich          │ Qiymat",
    "─────────────────────┼──────────────────",
    `Holat                │ ${label}`,
    `Kunlik me'yor        │ ${fmtDuration(SHIFT_MS)}`,
    `Bugun ishlangan      │ ${fmtDuration(card.dayWorkedMs)}`,
  ];

  if (dayLeft > 60_000) {
    rows.push(
      `Kunlik qarz          │ ${fmtDuration(dayLeft)}`,
      `Hisoblash            │ ${fmtDuration(SHIFT_MS)} − ${fmtDuration(card.dayWorkedMs)}`
    );
  } else {
    rows.push("Kunlik qarz          │ 0 (me'yor bajarildi)");
  }

  rows.push(
    "─────────────────────┼──────────────────",
    `Oy (${month})`,
    `Jami ishlangan       │ ${fmtDuration(card.monthWorkedMs)}`,
    `Umumiy qarz          │ ${fmtDuration(card.monthDebtMs)}`,
    `Ish kunlari          │ ${card.workDays}`
  );

  if (card.kind !== "left" && card.status === "in") {
    rows.push(`Status               │ Hozir ishda`);
  }

  return (
    `📊 <b>ISH VAQTI JADVALI</b>\n` +
    `👤 ${who} · ${dayIso} · ${card.clock}\n\n` +
    preTable(rows)
  );
}

/** @deprecated — formatShortCaption + formatPingBreakdown ishlatiladi */
export function formatGroupCaption(card) {
  return formatShortCaption(card);
}
