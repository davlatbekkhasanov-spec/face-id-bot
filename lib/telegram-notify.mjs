import fs from "fs";
import path from "path";
import { formatShortCaption } from "./attendance-card.mjs";
import { normalizePortraitForNotify } from "./portrait.mjs";

export function resolveStaffPhoto(dataDir, staffKey, employees, extraDirs = []) {
  const staff = employees.staff?.[staffKey];
  const rel = staff?.photoFile || `faces/${staffKey}.jpg`;
  let best = null;
  let bestMtime = 0;
  for (const dir of [...extraDirs, dataDir].filter(Boolean)) {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) continue;
    const mtime = fs.statSync(abs).mtimeMs;
    if (mtime >= bestMtime) {
      bestMtime = mtime;
      best = abs;
    }
  }
  return best;
}

/** Faqat bitta xabar: kichik rasm + sarlavha (matn alohida emas) */
export async function sendKeldiKetdi(botToken, chatId, card, photoPath) {
  const base = `https://api.telegram.org/bot${botToken}`;
  const caption = card.caption?.trim() ? card.caption : formatShortCaption(card);

  if (photoPath && fs.existsSync(photoPath)) {
    const buf = await normalizePortraitForNotify(photoPath);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([buf]), "notify.jpg");
    const res = await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "sendPhoto xato");
    return data.result;
  }

  console.warn("Rasm topilmadi:", card.staffKey);
  const res = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "sendMessage xato");
  return data.result;
}

export const sendAttendanceCard = sendKeldiKetdi;
