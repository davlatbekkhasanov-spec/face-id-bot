/**
 * Chatdan kelgan rasmni hodim profiliga saqlash.
 * Usage: node scripts/register-face.mjs <image-path>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { currentEmployee, afterPhoto, loadRegistration } from "../lib/register-wizard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

async function toJpegBuffer(srcPath) {
  const buf = fs.readFileSync(srcPath);
  const ext = path.extname(srcPath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp") {
    return buf;
  }
  if (ext === ".heic" || ext === ".heif") {
    const convert = (await import("heic-convert")).default;
    return Buffer.from(await convert({ buffer: buf, format: "JPEG", quality: 0.92 }));
  }
  throw new Error(`Qo'llab-quvvatlanmaydigan format: ${ext}`);
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error("Usage: node scripts/register-face.mjs <image-path>");
    process.exit(1);
  }
  const reg = loadRegistration(dataDir);
  if (!reg.active || !reg.awaitingPhoto) {
    console.error("Registration aktiv emas");
    process.exit(1);
  }
  const emp = currentEmployee(dataDir);
  if (!emp) {
    console.error("Navbatda hodim yo'q");
    process.exit(1);
  }

  const facesDir = path.join(dataDir, "faces");
  fs.mkdirSync(facesDir, { recursive: true });
  const dest = path.join(facesDir, `${emp.key}.jpg`);
  const jpeg = await toJpegBuffer(path.resolve(src));
  fs.writeFileSync(dest, jpeg);

  const result = afterPhoto(dataDir, `faces/${emp.key}.jpg`);
  console.log(JSON.stringify({ employee: emp.name, telegramId: emp.telegramId, ...result }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
