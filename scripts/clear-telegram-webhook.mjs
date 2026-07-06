/** BOT-MARKET webhook o'chirish — face-id-bot */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureTelegramPolling } from "../lib/telegram-webhook.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const out = await ensureTelegramPolling(process.env.BOT_TOKEN);
if (!out.ok) {
  console.error("BOT_TOKEN yo'q");
  process.exit(1);
}
console.log(
  out.hadWebhook
    ? `OK — webhook o'chirildi (@${out.username})`
    : `OK — webhook yo'q (@${out.username})`
);
