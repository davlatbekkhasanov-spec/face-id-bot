import fs from "fs";
import path from "path";
import { formatPingAlert } from "./attendance-card.mjs";

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

  // 1) Ping — ovozli bildirishnoma (alohida qisqa xabar)
  await tgJson(botToken, "sendMessage", {
    chat_id: chatId,
    text: formatPingAlert(card),
    parse_mode: "HTML",
  });

  // 2) Rasm + to'liq statistika (ping parametrini yubormaymiz = ovoz bor)
  if (photoPath && fs.existsSync(photoPath)) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", card.caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([fs.readFileSync(photoPath)]), "face.jpg");
    const res = await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "sendPhoto xato");
    return data.result;
  }

  return tgJson(botToken, "sendMessage", {
    chat_id: chatId,
    text: card.caption,
    parse_mode: "HTML",
  });
}
