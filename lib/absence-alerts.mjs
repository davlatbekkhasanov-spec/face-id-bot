import { dayKey } from "./period.mjs";
import { fmtDayHuman } from "./admin-report-data.mjs";
import { shiftStartFor, shiftStartMsToday, formatShiftLabel, hasShiftTracking } from "./shifts.mjs";
import { displayName } from "./attendance-core.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { isDayEndOverride } from "./day-end-override.mjs";
import {
  staffArrivedToday,
  wasAbsenceAlertSent,
  markAbsenceAlertSent,
  getAbsence,
} from "./absence-db.mjs";

const WINDOW_MS = 90_000;
const ALERT_HOURS = Math.max(1, Number(process.env.ABSENCE_ALERT_HOURS || 2));

function isWeekendKey(dk) {
  const w = new Date(`${dk}T12:00:00+05:00`).getDay();
  return w === 0 || w === 6;
}

function absenceAlertMs(staff, staffKey, ms = Date.now()) {
  return shiftStartMsToday(staff, staffKey, ms) + ALERT_HOURS * 60 * 60 * 1000;
}

export function absenceAlertKeyboard(staffKey) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Входной", callback_data: `abs:e:${staffKey}` },
        { text: "❌ Sababsiz", callback_data: `abs:u:${staffKey}` },
      ],
    ],
  };
}

function absenceAlertText(name, staff, staffKey, dk) {
  const shift = formatShiftLabel(staff, staffKey) || shiftStartFor(staff, staffKey);
  return (
    `⚠️ <b>KELMADI</b>\n` +
    `👤 ${name}\n` +
    `📅 ${fmtDayHuman(dk)}\n` +
    `📋 Smena: <b>${shift}</b>\n` +
    `🕐 Smena boshidan <b>${ALERT_HOURS} soat</b> o'tdi — Face ID yo'q\n\n` +
    `<i>Belgilanmaguncha kuting yoki tugmani bosing:</i>`
  );
}

/** Qo'lda test — bazaga yozilmaydi, faqat admin ga xabar */
export async function sendAbsenceAlertDemo(ctx, chatId, staffKey) {
  const { employees, tgSend } = ctx;
  const staff = employees.staff?.[staffKey];
  if (!staff) return { ok: false, error: "Hodim topilmadi." };
  if (!hasShiftTracking(staff)) return { ok: false, error: "Bu hodimda smena yo'q." };

  const dk = dayKey();
  const name = staffReplyLabel(staff);
  const text =
    `🧪 <i>Qo'lda test — avtomatik xabar emas</i>\n\n` + absenceAlertText(name, staff, staffKey, dk);

  await tgSend(chatId, text, { reply_markup: absenceAlertKeyboard(staffKey) });
  return { ok: true, name };
}

/** Smena +2 soat: admin ga xabar (har bir kelmagan hodim) */
export async function checkAbsenceAlerts(ctx) {
  const { employees, adminChatId, tgSend } = ctx;
  if (!adminChatId || !tgSend) return [];

  const now = Date.now();
  const dk = dayKey(now);
  if (isDayEndOverride(dk) || isWeekendKey(dk)) return [];

  const sent = [];
  for (const [key, staff] of Object.entries(employees.staff || {})) {
    if (!hasShiftTracking(staff)) continue;

    const alertAt = absenceAlertMs(staff, key, now);
    if (now < alertAt || now > alertAt + WINDOW_MS) continue;
    if (wasAbsenceAlertSent(dk, key)) continue;
    if (staffArrivedToday(key, dk)) continue;

    const existing = getAbsence(dk, key);
    if (existing?.status === "excused" || existing?.status === "unexcused") continue;

    const name = staffReplyLabel(staff);
    const text = absenceAlertText(name, staff, key, dk);
    try {
      const msg = await tgSend(adminChatId, text, {
        reply_markup: absenceAlertKeyboard(key),
      });
      markAbsenceAlertSent(dk, key, name, msg?.message_id);
      sent.push(key);
    } catch (e) {
      console.warn("absence alert:", key, e.message);
    }
  }
  return sent;
}

export function formatAbsenceResolvedMessage(staffName, status, dk) {
  if (status === "excused") {
    return (
      `✅ <b>Входной</b>\n👤 ${staffName}\n📅 ${fmtDayHuman(dk)}\n` +
      `<i>Jarima yo'q · tabelda «В»</i>`
    );
  }
  return (
    `❌ <b>Sababsiz ish qoldirish</b>\n👤 ${staffName}\n📅 ${fmtDayHuman(dk)}\n` +
    `<i>−1 ish kuni · tabelda «Н»</i>`
  );
}
