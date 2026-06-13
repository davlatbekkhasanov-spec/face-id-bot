import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { wasSerialProcessed, markSerial } from "./db.mjs";
import { resolveStaffPhoto, sendKeldiKetdi } from "./telegram-notify.mjs";
import { skipOldEvent } from "./poll-watermark.mjs";

/** Face ID → faqat admin lichkasi (guruhga HECH QACHON) */
export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  const serial = Number(ev.serialNo || 0);
  if (serial && wasSerialProcessed(serial)) return false;
  if (skipOldEvent(ev, ctx.pollWatermarkMs)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;
  if (serial) markSerial(serial);

  const chatId = ctx.notifyChatId;
  if (!chatId || !ctx.botToken) return true;

  const photoPath = resolveStaffPhoto(ctx.dataDir, card.staffKey, employees);
  await sendKeldiKetdi(ctx.botToken, chatId, card, photoPath);
  return true;
}

export async function sendStoredCard() {
  return { ok: false, error: "Faqat Face ID skaneri ishlaydi" };
}

export async function sendManualAndStore(dataDir, botToken, chatId, card, employees) {
  const photoPath = resolveStaffPhoto(dataDir, card.staffKey, employees);
  if (chatId && botToken) await sendKeldiKetdi(botToken, chatId, card, photoPath);
  return { ok: true };
}
