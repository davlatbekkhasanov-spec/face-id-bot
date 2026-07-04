import { fmtDurationNorm, periodLabel, SHIFT_MS, dayKey } from "./period.mjs";
import { formatShiftLabel } from "./shifts.mjs";
import { formatPingTable } from "./ping-table.mjs";
import { formatPointsBlock } from "./points.mjs";
import { pointsEnabled } from "./points-config.mjs";

function shiftMs(card) {
  return card.shiftMs || SHIFT_MS;
}

function b(text) {
  return `<b>${text}</b>`;
}

function mention(name, telegramId) {
  if (telegramId) {
    return `<a href="tg://user?id=${telegramId}"><b>${name}</b></a>`;
  }
  return b(name);
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
  return formatPingTable(rows);
}

function appendLeaveSummary(text, card) {
  const norm = fmtDurationNorm(card.shiftMs);
  const worked = fmtDurationNorm(card.dayWorkedMs);

  text += `\n\n📊 ${b("KUNLIK NATIJA")}`;
  if (card.firstInClock) {
    text += `\n📥 ${b("Kelgan")}: ${b(card.firstInClock)}`;
    if (card.firstLateMs > 0 && card.firstLateLabel) {
      text += ` · ${b("Kechikdi " + card.firstLateLabel)}`;
    } else if (card.firstEarlyMs > 0 && card.firstEarlyLabel) {
      text += ` · ${b("Erta " + card.firstEarlyLabel)}`;
    }
  }
  text += `\n📤 ${b("Ketgan")}: ${b(card.clock)}`;
  text += `\n📏 ${b("Me'yor")}: ${b(norm)}`;
  text += `\n✅ ${b("Ishlagan")}: ${b(worked)}`;

  if (card.overtimeMs > 0 && card.overtimeLabel) {
    text += `\n💪 ${b("Me'yordan ortiq")}: ${b(card.overtimeLabel)}`;
  }

  if (card.dayDebtMs > 60_000) {
    const debt = fmtDurationNorm(card.dayDebtMs);
    text += `\n💰 ${b("Ish beruvchidan qarzingiz")}: ${b(debt)}`;
  } else {
    text += `\n🟢 ${b("Me'yor bajarildi")}`;
    if (card.overtimeMs > 0 && card.overtimeLabel) {
      text += `\n💪 ${b("Qo'shimcha ish")}: ${b(card.overtimeLabel)}`;
    }
  }
  return text;
}

function appendNoShiftSummary(text, card) {
  if (card.kind === "left") {
    if (card.firstInClock) {
      text += `\n📥 ${b("Kelgan")}: ${b(card.firstInClock)}`;
    }
    text += `\n📤 ${b("Ketgan")}: ${b(card.clock)}`;
    text += `\n✅ ${b("Ishlagan")}: ${b(fmtDurationNorm(card.dayWorkedMs || 0))}`;
  } else {
    text += `\n🕐 ${b("Kelgan")}: ${b(card.clock)}`;
  }
  return text;
}

/** Smenasiz hodimlar (admin): faqat kelgan/ketgan vaqt va ish soati */
function formatNoShiftCaption(card) {
  const who = mention(card.staffName, card.telegramId);
  const label = card.kind === "left" ? "KETDI" : "KELDI";
  const icon = card.kind === "left" ? "📤" : "📥";

  let text = `${icon} ${b(label)}`;
  if (card.manual) text = `✍️ ${text}`;
  text += `\n👤 ${who}`;
  return appendNoShiftSummary(text, card);
}

/** 1-xabar: rasm ostidagi sarlavha */
export function formatShortCaption(card) {
  if (card.noShift) return formatNoShiftCaption(card);

  const who = mention(card.staffName, card.telegramId);
  const label = KIND_LABEL[card.kind] || "HODISA";
  const icon = KIND_ICON[card.kind] || "📌";
  const shift =
    !card.noShift &&
    (card.shiftLabel ||
      (card.shiftStart && card.shiftEnd
        ? `${card.shiftStart} — ${card.shiftEnd}`
        : null));

  let text = `${icon} ${b(label)}`;
  if (card.manual) text = `✍️ ${text}`;
  text += `\n👤 ${who}`;
  text += `\n🕐 ${b(card.clock)}`;
  if (shift) text += `\n📋 ${b("Smena")}: ${b(shift)}`;

  if (card.kind === "arrived") {
    if (card.lateMs > 0 && card.lateLabel) {
      text += `\n⏰ ${b("Kechikdi")}: ${b(card.lateLabel)}`;
      text += `\n<i>Smena ${card.shiftStart} dan kech</i>`;
    } else if (card.earlyMs > 0 && card.earlyLabel) {
      text += `\n⏳ ${b("Erta keldi")}: ${b(card.earlyLabel)}`;
      text += `\n<i>Smena ${card.shiftStart} dan oldin</i>`;
    } else if (!card.noShift) {
      text += `\n🟢 ${b("Vaqtida keldi")}`;
    }
  }

  if (card.kind === "returned") {
    if (card.breakMs > 0 && card.breakLabel) {
      text += `\n☕ ${b("Tanaffus")}: ${b(card.breakLabel)}`;
    }
  }

  if (card.kind === "left" && !card.noShift) {
    text = appendLeaveSummary(text, card);
  }

  if (pointsEnabled() && !card.noShift && card.dayPoints != null) {
    text = formatPointsBlock(text, card);
  }

  return text;
}

/** 2-xabar: ping jadval */
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
      `Ish beruvchidan qarz   | ${fmtDurationNorm(dayLeft)}`,
      `Hisob                  | ${fmtDurationNorm(sm)} - ${fmtDurationNorm(card.dayWorkedMs)}`
    );
  } else {
    rows.push("Natija                 | Me'yor bajarildi");
  }

  rows.push(
    "-----------------------|------------------",
    `Oy (${month})`,
    `Jami ishlagan          | ${fmtDurationNorm(card.monthWorkedMs)}`,
    `Umumiy qarz            | ${fmtDurationNorm(card.monthDebtMs)}`,
    `Ish kunlari            | ${card.workDays}`
  );

  if (card.kind !== "left" && card.status === "in") {
    rows.push(`Holat                  | Hozir ishda`);
  }

  return (
    `📊 ${b("ISH VAQTI JADVALI")}\n` +
    `👤 ${who} · ${dayIso} · ${b(card.clock)}\n\n` +
    preTable(rows)
  );
}

export function formatGroupCaption(card) {
  return formatShortCaption(card);
}
