import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizePortrait } from "../lib/portrait.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const facesDir = path.join(__dirname, "..", "data", "faces");

const files = fs.readdirSync(facesDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
let ok = 0;
for (const f of files) {
  const p = path.join(facesDir, f);
  try {
    await normalizePortrait(p, p);
    ok++;
    console.log("OK", f);
  } catch (e) {
    console.warn("FAIL", f, e.message);
  }
}
console.log(`\n${ok}/${files.length} rasm bir xil o'lchamga keltirildi (800×920)`);
