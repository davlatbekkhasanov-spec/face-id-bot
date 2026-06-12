import { buildAttendanceCard, isFaceEvent } from "./attendance.mjs";
import { wasSerialProcessed, markSerial } from "./db.mjs";
import { resolveStaffPhoto, sendAttendanceCard } from "./telegram-notify.mjs";

export async function handleFaceEvent(ev, employees, ctx) {
  if (!isFaceEvent(ev)) return false;
  const serial = Number(ev.serialNo || 0);
  if (serial && wasSerialProcessed(serial)) return false;

  const card = buildAttendanceCard(ev, employees);
  if (!card) return false;
  if (serial) markSerial(serial);

  const photoPath = resolveStaffPhoto(ctx.dataDir, card.staffKey, employees);
  const targets = ctx.groupChatId ? [ctx.groupChatId] : [];
  if (ctx.notifyChatId && ctx.notifyChatId !== ctx.groupChatId) {
    targets.push(ctx.notifyChatId);
  }

  for (const chatId of targets) {
    await sendAttendanceCard(ctx.botToken, chatId, card, photoPath);
  }
  return true;
}
