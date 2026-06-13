import fs from "fs";
import path from "path";
import { formatShortCaption } from "./attendance-card.mjs";
import { normalizePortraitForNotify } from "./portrait.mjs";

export function resolveStaffPhoto(dataDir, staffKey, employees) {
  const staff = employees.staff?.[staffKey];
  const rel = staff?.photoFile || `faces/${staffKey}.jpg`;
  const abs = path.join(dataDir, rel);
  return fs.existsSync(abs) ? abs : null;
}

/** Oddiy: hodim rasmi + «ИШГА КЕЛДИ» / «ИШДАН КЕТДИ» */
export async function sendKeldiKetdi(botToken, chatId, card, photoPath) {
  const base = `https://api.telegram.org/bot${botToken}`;
  const caption = formatShortCaption(card);

  if (photoPath && fs.existsSync(photoPath)) {
    const buf = await normalizePortraitForNotify(photoPath);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([buf]), path.basename(photoPath));
    const res = await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "sendPhoto xato");
    return data.result;
  }

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
