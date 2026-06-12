import { dayKey } from "./period.mjs";
import { reminderMsBefore, shiftStartFor } from "./shifts.mjs";
import { getMeta, setMeta } from "./db.mjs";
import { displayName } from "./attendance-core.mjs";

const WINDOW_MS = 60_000;

export function checkShiftReminders(employees, sendFn) {
  const now = Date.now();
  const dk = dayKey(now);
  const sent = [];

  for (const [key, staff] of Object.entries(employees.staff || {})) {
    if (!staff.telegramId) continue;
    const remindAt = reminderMsBefore(staff, key, now);
    if (now < remindAt || now > remindAt + WINDOW_MS) continue;

    const metaKey = `remind_${key}_${dk}`;
    if (getMeta(metaKey)) continue;

    const name = displayName(key, {}, employees);
    const start = shiftStartFor(staff, key);
    const text =
      `⏰ <b>${name}</b>, 10 дақиқadan so'ng иш joyingizda bo'lishni unutmang!\n` +
      `🕐 Smena boshlanishi: <b>${start}</b>`;

    sendFn(Number(staff.telegramId), text);
    setMeta(metaKey, "1");
    sent.push(key);
  }
  return sent;
}
