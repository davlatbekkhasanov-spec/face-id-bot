/**
 * Desktop/hodimlar papkasidagi rasmni joriy hodimga biriktiradi.
 * Usage: node scripts/import-hodim-photo.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  currentEmployee,
  afterPhoto,
  loadRegistration,
  askMessage,
} from "../lib/register-wizard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const HODIMLAR_DIR =
  process.env.HODIMLAR_DIR ||
  path.join(process.env.USERPROFILE || "", "Desktop", "hodimlar");
const DONE_DIR = path.join(HODIMLAR_DIR, "saqlandi");

const IMG_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

async function toJpegBuffer(srcPath) {
  const buf = fs.readFileSync(srcPath);
  const ext = path.extname(srcPath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return buf;
  if (ext === ".heic" || ext === ".heif") {
    const convert = (await import("heic-convert")).default;
    return Buffer.from(await convert({ buffer: buf, format: "JPEG", quality: 0.92 }));
  }
  throw new Error(`Format qo'llab-quvvatlanmaydi: ${ext}`);
}

function findPhoto() {
  if (!fs.existsSync(HODIMLAR_DIR)) {
    throw new Error(`Papka yo'q: ${HODIMLAR_DIR}`);
  }
  const files = fs
    .readdirSync(HODIMLAR_DIR)
    .filter((f) => IMG_RE.test(f))
    .map((f) => ({
      name: f,
      path: path.join(HODIMLAR_DIR, f),
      mtime: fs.statSync(path.join(HODIMLAR_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

async function main() {
  const reg = loadRegistration(dataDir);
  if (!reg.active || !reg.awaitingPhoto) {
    console.log(JSON.stringify({ ok: false, error: "Ro'yxatdan o'tish aktiv emas" }));
    process.exit(1);
  }
  const emp = currentEmployee(dataDir);
  if (!emp) {
    console.log(JSON.stringify({ ok: false, error: "Navbatda hodim yo'q" }));
    process.exit(1);
  }

  const photo = findPhoto();
  if (!photo) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "Papkada rasm yo'q",
        folder: HODIMLAR_DIR,
        waiting: emp.name,
        telegramId: emp.telegramId,
      })
    );
    process.exit(1);
  }

  const facesDir = path.join(dataDir, "faces");
  fs.mkdirSync(facesDir, { recursive: true });
  fs.mkdirSync(DONE_DIR, { recursive: true });

  const dest = path.join(facesDir, `${emp.key}.jpg`);
  const jpeg = await toJpegBuffer(photo.path);
  fs.writeFileSync(dest, jpeg);

  const result = afterPhoto(dataDir, `faces/${emp.key}.jpg`);
  const archived = path.join(DONE_DIR, `${emp.key}_${Date.now()}_${photo.name}`);
  fs.renameSync(photo.path, archived);

  const out = {
    ok: true,
    saved: emp.name,
    telegramId: emp.telegramId,
    archived,
    done: result.done,
    nextMessage: result.done ? null : result.text.replace(/<[^>]+>/g, ""),
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
