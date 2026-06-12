import fs from "fs";

/** Barcha hodim rasmlari — bir xil o'lcham va kadr */
export const PORTRAIT_W = 800;
export const PORTRAIT_H = 920;

export async function normalizePortrait(photoPath, outPath) {
  const sharp = (await import("sharp")).default;
  let img = sharp(photoPath).rotate();
  try {
    img = img.resize(PORTRAIT_W, PORTRAIT_H, { fit: "cover", position: "attention" });
  } catch {
    img = img.resize(PORTRAIT_W, PORTRAIT_H, { fit: "cover", position: "top" });
  }
  const buf = await img
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  if (outPath != null) {
    fs.writeFileSync(outPath, buf);
  }
  return buf;
}

export function portraitB64FromBuffer(buf) {
  return buf.toString("base64");
}
