import { fmtDuration, periodLabel, SHIFT_MS } from "./period.mjs";

function mention(name, telegramId) {
  if (telegramId) {
    return `<a href="tg://user?id=${telegramId}">${name}</a>`;
  }
  return `<b>${name}</b>`;
}

function lineDebt(ms) {
  if (ms <= 60_000) return "✅ Kunlik me'yor bajarildi";
  return `⚠️ Ish beruvchiga qarz: <b>${fmtDuration(ms)}</b>`;
}

/** Guruhga foto caption (HTML, ≤1024) */
export function formatGroupCaption(card) {
  const who = mention(card.staffName, card.telegramId);
  const month = periodLabel(card.periodKey);
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);

  let head;
  if (card.kind === "arrived") head = `📥 <b>ISHGA KELDI</b>`;
  else if (card.kind === "returned") head = `🔄 <b>YANA ISHGA QAYTDI</b>`;
  else head = `📤 <b>ISHDAN KETDI</b>`;

  let text =
    `${head}\n` +
    `👤 ${who}\n` +
    `🕐 ${card.clock}\n\n` +
    `📊 <b>BUGUN</b>\n` +
    `⏱ Ishlangan: <b>${fmtDuration(card.dayWorkedMs)}</b> / ${fmtDuration(SHIFT_MS)}\n`;

  if (card.kind === "left") {
    text += dayLeft > 60_000
      ? `📋 Kunlik qarz: <b>${fmtDuration(dayLeft)}</b>\n`
      : `✅ Kunlik me'yor bajarildi\n`;
  } else if (dayLeft > 60_000) {
    text += `📋 Qolgan: <b>${fmtDuration(dayLeft)}</b>\n`;
  } else if (card.dayWorkedMs > 0) {
    text += `✅ Kunlik me'yor bajarildi\n`;
  }

  text +=
    `\n📅 <b>OY</b> (${month})\n` +
    `✅ Jami ishlangan: <b>${fmtDuration(card.monthWorkedMs)}</b>\n` +
    `⚠️ Umumiy qarz: <b>${fmtDuration(card.monthDebtMs)}</b>\n` +
    `📆 Ish kunlari: <b>${card.workDays}</b>`;

  if (card.kind !== "left" && card.status === "in") {
    text += `\n\n<i>Hozir ishda</i>`;
  }

  return text;
}
