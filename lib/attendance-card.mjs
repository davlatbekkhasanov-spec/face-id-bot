import { fmtDurationNorm, periodLabel, SHIFT_MS, dayKey } from "./period.mjs";
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

function appendLeaveSummary(text, card) {
  const norm = fmtDurationNorm(card.shiftMs);
  const worked = fmtDurationNorm(card.dayWorkedMs);
  text += `\n\n📊 <b>Kunlik natija</b>`;
  text += `\n📏 Me'yor: <b>${norm}</b>`;
  text += `\n✅ Ishlagan: <b>${worked}</b>`;

  if (card.overtimeMs > 0 && card.overtimeLabel) {
    text += `\n💪 Smenadan keyin: <b>${card.overtimeLabel}</b>`;
    if (card.dayDebtMs <= 60_000) {
      text += `\n🟢 Me'yor bajarildi`;
    }
  } else if (card.dayDebtMs > 60_000) {
    const debt = fmtDurationNorm(card.dayDebtMs);
    text += `\n⚠️ Yetmay qoldi: <b>${debt}</b>`;
    text += `\n<i>${norm} − ${worked} = ${debt}</i>`;
  } else {
    text += `\n🟢 Me'yor bajarildi`;
  }
  return text;
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

  let text = `${icon} <b>${label}</b>`;
  if (card.manual) text = `✍️ ${text}`;
  text += `\n👤 ${who}\n🕐 ${card.clock}`;
  if (shift) text += `\n📋 Smena: <b>${shift}</b>`;

  if (card.kind === "arrived") {
    if (card.lateMs > 0 && card.lateLabel) {
      text += `\n⏰ Kechikdi: <b>${card.lateLabel}</b> <i>(smena ${card.shiftStart} dan)</i>`;
    } else if (card.earlyMs > 0 && card.earlyLabel) {
      text += `\n⏳ Erta keldi: <b>${card.earlyLabel}</b> <i>(smena ${card.shiftStart} dan oldin)</i>`;
    } else if (!card.noShift) {
      text += `\n🟢 Vaqtida keldi`;
    }
  }

  if (card.kind === "returned") {
    if (card.breakMs > 0 && card.breakLabel) {
      text += `\n☕ Tanaffus: <b>${card.breakLabel}</b>`;
    }
  }

  if (card.kind === "left" && !card.noShift) {
    text = appendLeaveSummary(text, card);
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
    "Ko'rsatkich            | Qiymat",
    "-----------------------|------------------",
    `Holat                  | ${label}`,
    `Kunlik me'yor          | ${fmtDurationNorm(sm)}`,
    `Bugun ishlagan         | ${fmtDurationNorm(card.dayWorkedMs)}`,
  ];

  if (dayLeft > 60_000) {
    rows.push(
      `Yetmay qoldi           | ${fmtDurationNorm(dayLeft)}`,
      `Hisob                  | ${fmtDurationNorm(sm)} - ${fmtDurationNorm(card.dayWorkedMs)}`
    );
  } else {
    rows.push("Natija                 | Me'yor bajarildi");
  }

  rows.push(
    "-----------------------|------------------",
    `Oy (${month})`,
    `Jami ishlagan          | ${fmtDurationNorm(card.monthWorkedMs)}`,
    `Umumiy yetmay qoldi    | ${fmtDurationNorm(card.monthDebtMs)}`,
    `Ish kunlari            | ${card.workDays}`
  );

  if (card.kind !== "left" && card.status === "in") {
    rows.push(`Holat                  | Hozir ishda`);
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
