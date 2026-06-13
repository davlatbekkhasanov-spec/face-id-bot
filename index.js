/**
 * Local bot o'chirilgan.
 * Railway: npm start → railway.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const ON_RAILWAY = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_REPLICA_ID
);

if (ON_RAILWAY) {
  await import("./railway.mjs");
} else {
  console.error(
    "\n❌ Local bot O'CHIRILGAN.\n" +
      "   Terminal webhook → Railway (faceidbot-production.up.railway.app)\n" +
      "   ISHGA-TUSHIR.bat ni ISHLATMANG.\n"
  );
  process.exit(1);
}
