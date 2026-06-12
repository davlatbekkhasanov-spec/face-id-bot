/**
 * Hodimlarni Hikvision terminalga yuklash (mavjudlarni O'CHIRMAYDI).
 * Avval backup, keyin qo'shish/yangilash.
 *
 * Usage: node scripts/upload-faces-to-device.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import { loadEmployeesFile } from "../lib/register-wizard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const dryRun = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyKey = onlyArg ? onlyArg.split("=")[1] : null;

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const ip = (process.env.FACE_DEVICE_IP || "192.168.0.28").trim();
const user = (process.env.FACE_DEVICE_USER || "admin").trim();
const pass = process.env.FACE_DEVICE_PASSWORD || "";
const FDID = "1";

if (!pass) {
  console.error("FACE_DEVICE_PASSWORD yo'q");
  process.exit(1);
}

const client = new DigestFetch(user, pass);

async function api(method, urlPath, body, contentType) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = body;
    if (contentType) opts.headers["Content-Type"] = contentType;
  }
  const res = await client.fetch(`http://${ip}${urlPath}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, ok: res.ok };
}

function okResponse(r) {
  const sc = r.json?.statusCode ?? r.json?.UserInfoSearch?.responseStatusStrg;
  if (r.ok && (sc === 1 || sc === "OK" || sc === undefined)) return true;
  if (r.text.includes("OK") && r.status === 200) return true;
  return false;
}

async function backupUsers() {
  const body = JSON.stringify({
    UserInfoSearchCond: { searchID: "1", searchResultPosition: 0, maxResults: 100 },
  });
  const r = await api("POST", "/ISAPI/AccessControl/UserInfo/Search?format=json", body, "application/json");
  if (!okResponse(r)) throw new Error(`Backup search failed: ${r.status} ${r.text.slice(0, 200)}`);
  const users = r.json?.UserInfoSearch?.UserInfo || [];
  const list = Array.isArray(users) ? users : users ? [users] : [];
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `device-users-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ ip, savedAt: new Date().toISOString(), users: list }, null, 2));
  console.log(`Backup: ${list.length} user → ${file}`);
  return list;
}

async function resizeJpeg(srcPath, maxBytes = 190_000) {
  const sharp = (await import("sharp")).default;
  let quality = 88;
  let buf = await sharp(srcPath).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  while (buf.length > maxBytes && quality > 40) {
    quality -= 8;
    buf = await sharp(srcPath).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  }
  return buf;
}

async function upsertUser(employeeNo, name) {
  const payload = {
    UserInfo: {
      employeeNo: String(employeeNo),
      name,
      userType: "normal",
      Valid: {
        enable: true,
        beginTime: "2026-01-01T00:00:00",
        endTime: "2036-12-31T23:59:59",
        timeType: "local",
      },
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
    },
  };
  if (dryRun) return { ok: true, dry: true };
  const r = await api(
    "POST",
    "/ISAPI/AccessControl/UserInfo/Record?format=json",
    JSON.stringify(payload),
    "application/json"
  );
  return { ok: okResponse(r), detail: r.text.slice(0, 300) };
}

async function uploadFace(employeeNo, jpegBuf) {
  if (dryRun) return { ok: true, dry: true };
  const boundary = `----Hikvision${Date.now()}`;
  const meta = JSON.stringify({
    faceLibType: "blackFD",
    FDID,
    FPID: String(employeeNo),
  });
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="FaceDataRecord"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="FaceImage"; filename="face.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, jpegBuf, tail]);
  const r = await api(
    "POST",
    "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
    body,
    `multipart/form-data; boundary=${boundary}`
  );
  return { ok: okResponse(r), detail: r.text.slice(0, 300) };
}

async function main() {
  console.log(`Terminal: ${ip} | dryRun=${dryRun}`);

  const info = await api("GET", "/ISAPI/System/deviceInfo");
  if (!info.ok) throw new Error(`Ulanish yo'q: ${info.status}`);

  const existing = await backupUsers();
  const existingNos = new Set(existing.map((u) => String(u.employeeNo)));

  const { staff } = loadEmployeesFile(dataDir);
  const results = [];

  for (const [key, s] of Object.entries(staff)) {
    if (onlyKey && key !== onlyKey) continue;
    const employeeNo = String(key);
    const name = s.deviceName || `${s.lastName} ${s.firstName}`.toUpperCase();
    const facePath = path.join(dataDir, s.photoFile || `faces/${key}.jpg`);

    if (!fs.existsSync(facePath)) {
      results.push({ name, employeeNo, ok: false, error: "Rasm yo'q" });
      continue;
    }

    const exists = existingNos.has(employeeNo);
    console.log(`\n→ ${name} (${employeeNo})${exists ? " [yangilash]" : " [yangi]"}`);

    const userRes = await upsertUser(employeeNo, name);
    if (!userRes.ok) {
      results.push({ name, employeeNo, ok: false, step: "user", detail: userRes.detail });
      console.log("  ❌ user:", userRes.detail);
      continue;
    }
    console.log("  ✓ user");

    const jpeg = await resizeJpeg(facePath);
    const faceRes = await uploadFace(employeeNo, jpeg);
    if (!faceRes.ok) {
      results.push({ name, employeeNo, ok: false, step: "face", detail: faceRes.detail });
      console.log("  ❌ face:", faceRes.detail);
      continue;
    }
    console.log(`  ✓ face (${jpeg.length} bytes)`);
    results.push({ name, employeeNo, ok: true });
  }

  const after = dryRun ? existing : await (async () => {
    const body = JSON.stringify({
      UserInfoSearchCond: { searchID: "2", searchResultPosition: 0, maxResults: 100 },
    });
    const r = await api("POST", "/ISAPI/AccessControl/UserInfo/Search?format=json", body, "application/json");
    const users = r.json?.UserInfoSearch?.UserInfo || [];
    return Array.isArray(users) ? users : users ? [users] : [];
  })();

  console.log(`\n=== Yakun: ${results.filter((x) => x.ok).length}/${results.length} muvaffaqiyatli ===`);
  console.log(`Terminalda jami: ${after.length} hodim (backup: ${existing.length})`);
  if (after.length < existing.length) {
    console.error("⚠️ DIQQAT: hodimlar soni kamaydi!");
    process.exit(1);
  }

  const failed = results.filter((x) => !x.ok);
  if (failed.length) {
    console.log("Xatolar:", JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
