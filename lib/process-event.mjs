import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { resolveAttendanceChatId } from "./chats.mjs";
import { resolveStaffPhoto, sendKeldiKetdi } from "./telegram-notify.mjs";
import { skipOldEvent } from "./poll-watermark.mjs";

/** Face ID → ATTENDANCE_TO_GROUP=1 bo'lsa guruhga, aks holda admin lichkaga */
export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  if (skipOldEvent(ev, ctx.pollWatermarkMs)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;

  const chatId = resolveAttendanceChatId(ctx);
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

export async function sendManualAndStore(dataDir, botToken, ctx, card, employees) {
  const photoPath = resolveStaffPhoto(dataDir, card.staffKey, employees);
  const chatId = resolveAttendanceChatId({ ...ctx, botToken });
  if (chatId && botToken) await sendKeldiKetdi(botToken, chatId, card, photoPath);
  return { ok: true };
}
