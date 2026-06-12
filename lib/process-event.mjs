import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { wasSerialProcessed, markSerial } from "./db.mjs";
import { saveLastCard } from "./last-card.mjs";
import { resolveStaffPhoto, sendAttendanceCard } from "./telegram-notify.mjs";

/** Skaner hodisasi — faqat saqlaydi, avtomatik yubormaydi */
export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  const serial = Number(ev.serialNo || 0);
  if (serial && wasSerialProcessed(serial)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;
  if (serial) markSerial(serial);

  const photoPath = resolveStaffPhoto(ctx.dataDir, card.staffKey, employees);
  saveLastCard(ctx.dataDir, card, photoPath);

  if (ctx.notifyChatId && ctx.botToken) {
    const label = card.caption?.replace(/<[^>]+>/g, "") || card.staffName;
    await fetch(`https://api.telegram.org/bot${ctx.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ctx.notifyChatId,
        text: `✅ Saqlandi: ${label}\n📊 /panel → «Oxirgi hisobotni yuborish»`,
        parse_mode: "HTML",
      }),
    }).catch(() => {});
  }

  return true;
}

/** Admin tugmasi — faqat shu chatga yuboriladi (guruh emas) */
export async function sendStoredCard(dataDir, botToken, chatId, employees) {
  const { loadLastCard } = await import("./last-card.mjs");
  const stored = loadLastCard(dataDir);
  if (!stored?.card) return { ok: false, error: "Oxirgi hisobot yo'q" };
  await sendAttendanceCard(botToken, chatId, stored.card, stored.photoPath);
  return { ok: true, card: stored.card };
}

export async function sendManualAndStore(dataDir, botToken, chatId, card, employees) {
  const photoPath = resolveStaffPhoto(dataDir, card.staffKey, employees);
  saveLastCard(dataDir, card, photoPath);
  if (chatId) await sendAttendanceCard(botToken, chatId, card, photoPath);
  return { ok: true };
}
