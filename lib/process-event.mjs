import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { resolveStaffPhoto, sendKeldiKetdi } from "./telegram-notify.mjs";
import { skipOldEvent } from "./poll-watermark.mjs";

/** Face ID → faqat guruh, bitta xabar (rasm + matn) */
export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  if (skipOldEvent(ev, ctx.pollWatermarkMs)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;

  const chatId = ctx.groupChatId;
  if (!chatId || !ctx.botToken) return true;

  const photoPath = resolveStaffPhoto(
    ctx.dataDir,
    card.staffKey,
    employees,
    ctx.photoDirs
  );
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
