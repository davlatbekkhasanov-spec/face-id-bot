import fs from "fs";

/** Hisobot / saqlash — A4 nisbat (portrait) */
export const PORTRAIT_W = 800;
export const PORTRAIT_H = 920;

/** Telegram xabar — aniq kichik (A4 ning ~45%, chatda ixcham) */
export const NOTIFY_PORTRAIT_W = 360;
export const NOTIFY_PORTRAIT_H = 414;

async function resizePortrait(photoPath, w, h) {
  const sharp = (await import("sharp")).default;
  let img = sharp(photoPath).rotate();
  try {
    img = img.resize(w, h, { fit: "cover", position: "attention" });
  } catch {
    img = img.resize(w, h, { fit: "cover", position: "top" });
  }
  return img
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export async function normalizePortrait(photoPath, outPath) {
  const buf = await resizePortrait(photoPath, PORTRAIT_W, PORTRAIT_H);
  if (outPath != null) {
    fs.writeFileSync(outPath, buf);
  }
  return buf;
}

/** Telegram keldi/ketdi — ixcham rasm */
export async function normalizePortraitForNotify(photoPath) {
  return resizePortrait(photoPath, NOTIFY_PORTRAIT_W, NOTIFY_PORTRAIT_H);
}

export function portraitB64FromBuffer(buf) {
  return buf.toString("base64");
}
