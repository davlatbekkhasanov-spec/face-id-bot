import fs from "fs";
import path from "path";

export function resolveStaffPhoto(dataDir, staffKey, employees) {
  const staff = employees.staff?.[staffKey];
  const rel = staff?.photoFile || `faces/${staffKey}.jpg`;
  const abs = path.join(dataDir, rel);
  return fs.existsSync(abs) ? abs : null;
}

export async function sendAttendanceCard(botToken, chatId, card, photoPath) {
  const caption = card.caption;
  const base = `https://api.telegram.org/bot${botToken}`;

  if (photoPath && fs.existsSync(photoPath)) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("disable_notification", "false");
    form.append("photo", new Blob([fs.readFileSync(photoPath)]), "face.jpg");
    const res = await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "sendPhoto xato");
    return data.result;
  }

  const res = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      disable_notification: false,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "sendMessage xato");
  return data.result;
}
