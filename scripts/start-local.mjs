/**
 * Do'konda ishga tushirish: Face ID poll + Telegram bot (admin panel)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = { ...process.env, USE_POLL: "1", TELEGRAM_POLL: "1" };

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
}

const child = spawn(process.execPath, ["index.js"], {
  cwd: root,
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
