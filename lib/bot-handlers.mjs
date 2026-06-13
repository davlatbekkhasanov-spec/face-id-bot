import { canUseBot, staffKeyByTelegramId, isRegisteredEmployee } from "./access.mjs";
import { buildManualCard } from "./manual-attendance.mjs";
import { sendManualAndStore } from "./process-event.mjs";
import { shiftStartFor, shiftMsFor } from "./shifts.mjs";
import { fmtDuration } from "./period.mjs";
import {
  adminMainKeyboard,
  employeePickKeyboard,
  actionKeyboard,
  employeeMenuKeyboard,
} from "./admin-ui.mjs";
import { getStaffState } from "./db.mjs";
import { displayName } from "./attendance-core.mjs";

export async function handleCallbackQuery(q, ctx) {
  const { botToken, dataDir, employees, adminIds, notifyChatId, groupChatId, tgAnswer, tgSend } = ctx;
  const uid = q.from?.id;
  const chatId = q.message?.chat?.id;
  const data = q.data || "";

  await tgAnswer(q.id);

  if (!adminIds.has(uid)) {
    return tgSend(chatId, "⛔ Faqat admin.");
  }

  if (data === "adm:menu") {
    return tgSend(chatId, "🎛 <b>Admin panel</b>", { reply_markup: adminMainKeyboard() });
  }

  if (data === "adm:pick") {
    return tgSend(chatId, "👤 Hodimni tanlang:", { reply_markup: employeePickKeyboard(employees) });
  }

  if (data === "adm:send_last") {
    return tgSend(chatId, "⚠️ Faqat Face ID skaneri ishlaydi — guruhga avtomatik keladi.");
  }

  if (data.startsWith("adm:emp:")) {
    const key = data.slice(8);
    const s = employees.staff?.[key];
    if (!s) return tgSend(chatId, "Hodim topilmadi.");
    const name = displayName(key, {}, employees);
    const start = shiftStartFor(s, key);
    return tgSend(
      chatId,
      `😊 <b>${name}</b>\n🕐 Smena: <b>${start}</b> · ${fmtDuration(shiftMsFor(s))}`,
      { reply_markup: actionKeyboard(key) }
    );
  }

  if (data.startsWith("adm:in:")) {
    const key = data.slice(7);
    const r = buildManualCard(key, employees, "in");
    if (r.error) return tgSend(chatId, `⚠️ ${r.error}`);
    await sendManualAndStore(dataDir, botToken, notifyChatId, r.card, employees);
    return tgSend(chatId, `✅ Lichkangizga yuborildi: ${r.card.staffName}`, {
      reply_markup: adminMainKeyboard(),
    });
  }

  if (data.startsWith("adm:out:")) {
    const key = data.slice(8);
    const r = buildManualCard(key, employees, "out");
    if (r.error) return tgSend(chatId, `⚠️ ${r.error}`);
    await sendManualAndStore(dataDir, botToken, notifyChatId, r.card, employees);
    return tgSend(chatId, `✅ Lichkangizga yuborildi: ${r.card.staffName}`, {
      reply_markup: adminMainKeyboard(),
    });
  }
}

export function employeeShiftInfo(uid, employees) {
  const key = staffKeyByTelegramId(uid, employees);
  if (!key) return null;
  const s = employees.staff[key];
  const st = getStaffState(key);
  const start = shiftStartFor(s, key);
  const norm = fmtDuration(shiftMsFor(s));
  const worked = st ? fmtDuration(st.day_worked_ms || 0) : "0 дақиқа";
  const name = displayName(key, {}, employees);
  return `📋 <b>${name}</b>\n🕐 Boshlanish: <b>${start}</b>\n⏱ Me'yor: <b>${norm}</b>\n📊 Bugun: <b>${worked}</b>`;
}

export function accessDeniedMessage() {
  return "⛔ Bu bot faqat ro'yxatdan o'tgan hodimlar uchun.";
}

export function adminWelcome() {
  return "🎛 <b>Admin panel</b>\n\nHisobotni qo'lda yuboring yoki hodimni tanlang.";
}

export function employeeWelcome(name) {
  return `👋 Salom, <b>${name}</b>!\n\n📋 Mening smenam — smena vaqtingizni ko'ring.`;
}

export { canUseBot, isRegisteredEmployee, adminMainKeyboard, employeeMenuKeyboard, employeePickKeyboard };
