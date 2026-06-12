import fs from "fs";
import path from "path";
import { formatShortCaption, formatPingBreakdown } from "./attendance-card.mjs";

export function resolveStaffPhoto(dataDir, staffKey, employees) {
  const staff = employees.staff?.[staffKey];
  const rel = staff?.photoFile || `faces/${staffKey}.jpg`;
  const abs = path.join(dataDir, rel);
  return fs.existsSync(abs) ? abs : null;
}

async function tgJson(botToken, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `${method} xato`);
  return data.result;
}

export async function sendAttendanceCard(botToken, chatId, card, photoPath) {
  const base = `https://api.telegram.org/bot${botToken}`;
  const caption = formatShortCaption(card);

  // 1) Rasm + qisqa sarlavha (yordamchi kunlik natija kabi)
  if (photoPath && fs.existsSync(photoPath)) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([fs.readFileSync(photoPath)]), "face.jpg");
    const res = await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "sendPhoto xato");
  } else {
    await tgJson(botToken, "sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
    });
  }

  // 2) Ping jadval — alohida xabar (ochko jadvali uslubida)
  await tgJson(botToken, "sendMessage", {
    chat_id: chatId,
    text: formatPingBreakdown(card),
    parse_mode: "HTML",
  });
}
