import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { formatGroupCaption } from "./attendance-card.mjs";
import { resolveAttendanceChatId, attendanceToGroup } from "./chats.mjs";
import { resolveStaffPhoto, sendKeldiKetdi } from "./telegram-notify.mjs";
import { skipOldEvent } from "./poll-watermark.mjs";

async function dispatchAttendance(ctx, card, photoPath) {
  const { botToken, groupChatId, adminChatId } = ctx;
  if (!botToken) return;

  if (attendanceToGroup() && groupChatId) {
    const groupCard = { ...card, caption: formatGroupCaption(card) };
    await sendKeldiKetdi(botToken, groupChatId, groupCard, photoPath);
    if (adminChatId) {
      await sendKeldiKetdi(botToken, adminChatId, card, photoPath);
    }
    return;
  }

  const chatId = resolveAttendanceChatId(ctx);
  if (chatId) await sendKeldiKetdi(botToken, chatId, card, photoPath);
}

/** Face ID → guruhga qisqa keldi/ketdi; admin lichkaga to'liq */
export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  if (skipOldEvent(ev, ctx.pollWatermarkMs)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;

  const chatId = resolveAttendanceChatId(ctx);
  if (!chatId && !(attendanceToGroup() && ctx.groupChatId)) return true;

  const photoPath = resolveStaffPhoto(
    ctx.dataDir,
    card.staffKey,
    employees,
    ctx.photoDirs
  );
  await dispatchAttendance(ctx, card, photoPath);
  return true;
}

export async function sendStoredCard() {
  return { ok: false, error: "Faqat Face ID skaneri ishlaydi" };
}

export async function sendManualAndStore(dataDir, botToken, ctx, card, employees) {
  const photoPath = resolveStaffPhoto(dataDir, card.staffKey, employees);
  if (botToken) {
    await dispatchAttendance({ ...ctx, botToken }, card, photoPath);
  }
  return { ok: true };
}
