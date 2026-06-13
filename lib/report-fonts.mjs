import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

let _cssBlock = "";

/** SVG ichiga embed qilinadigan @font-face (librsvg / Railway uchun). */
export function svgFontDefs() {
  if (_cssBlock) return _cssBlock;

  const regular = path.join(FONT_DIR, "NotoSans-Regular.ttf");
  const bold = path.join(FONT_DIR, "NotoSans-Bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    console.warn("Report fonts topilmadi:", FONT_DIR);
    _cssBlock = "";
    return _cssBlock;
  }

  const regB64 = fs.readFileSync(regular).toString("base64");
  const boldB64 = fs.readFileSync(bold).toString("base64");

  _cssBlock = `<style type="text/css"><![CDATA[
@font-face {
  font-family: 'FaceReport';
  src: url('data:font/ttf;base64,${regB64}') format('truetype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'FaceReport';
  src: url('data:font/ttf;base64,${boldB64}') format('truetype');
  font-weight: 700;
  font-style: normal;
}
]]></style>`;

  return _cssBlock;
}

export const REPORT_FONT = "FaceReport, DejaVu Sans, sans-serif";

export const REPORT_FONT_BOLD = "FaceReport, DejaVu Sans, sans-serif";
