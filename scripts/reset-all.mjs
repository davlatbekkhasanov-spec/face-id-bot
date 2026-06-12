/**
 * Barcha davomat statistikasini 0 ga tushirish
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, resetAllAttendance } from "../lib/db.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

initDb(process.env.DATABASE_DIR || dataDir);
resetAllAttendance();

for (const f of ["last-card.json", "bridge-state.json"]) {
  const p = path.join(process.env.DATABASE_DIR || dataDir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log("✅ Hamma davomat ma'lumotlari o'chirildi (0 dan boshlandi).");
