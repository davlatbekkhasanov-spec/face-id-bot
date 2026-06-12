/**
 * Hodim rasmini qabul qilish (Railway poll o'chirilgan paytda).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadRegistration,
  currentEmployee,
  afterPhoto,
  askMessage,
} from "../lib/register-wizard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_IDS?.split(/[,;]/)[0] || 1432810519);
const CHAT = process.env.NOTIFY_CHAT_ID || String(ADMIN_ID);

async function tg(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function downloadPhoto(fileId, destPath) {
  const f = await tg("getFile", { file_id: fileId });
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${f.file_path}`;
  const res = await fetch(url);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function send(text) {
  await tg("sendMessage", { chat_id: CHAT, text, parse_mode: "HTML" });
}

async function main() {
  const reg = loadRegistration(dataDir);
  if (!reg.active || !reg.awaitingPhoto) {
    console.error("Registration not active");
    process.exit(1);
  }
  const emp = currentEmployee(dataDir);
  if (!emp) {
    console.error("No employee in queue");
    process.exit(1);
  }

  await tg("deleteWebhook", { drop_pending_updates: false });
  let offset = 0;
  const deadline = Date.now() + 120_000;
  console.log(`Waiting photo for ${emp.name}...`);

  while (Date.now() < deadline) {
    const updates = await tg("getUpdates", { timeout: 25, offset, allowed_updates: ["message"] });
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg?.photo?.length) continue;
      if (msg.from?.id !== ADMIN_ID) continue;

      const facesDir = path.join(dataDir, "faces");
      fs.mkdirSync(facesDir, { recursive: true });
      const filename = `${emp.key}.jpg`;
      const dest = path.join(facesDir, filename);
      const best = msg.photo[msg.photo.length - 1];
      await downloadPhoto(best.file_id, dest);

      const result = afterPhoto(dataDir, `faces/${filename}`);
      await send(result.text);
      console.log("Saved:", dest);
      return;
    }
  }
  await send("⏱ Vaqt tugadi. Rasmni yana yuboring.");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
