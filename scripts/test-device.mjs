/**
 * Hikvision Face terminal ulanishini tekshirish (faqat o'qish).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const ip = (process.argv[2] || process.env.FACE_DEVICE_IP || "192.168.110.135").trim();
const user = (process.env.FACE_DEVICE_USER || "admin").trim();
const pass = (process.env.FACE_DEVICE_PASSWORD || "").trim();

if (!pass) {
  console.log("FACE_DEVICE_PASSWORD .env da yo'q. Avval parolni kiriting.");
  process.exit(1);
}

const client = new DigestFetch(user, pass);

async function get(path) {
  const res = await client.fetch(`http://${ip}${path}`);
  const text = await res.text();
  return { status: res.status, text };
}

function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? m[1] : "—";
}

console.log(`Tekshirilmoqda: http://${ip} (${user})`);

try {
  const info = await get("/ISAPI/System/deviceInfo");
  if (info.status === 401) {
    console.log("❌ 401 — parol noto'g'ri");
    process.exit(1);
  }
  if (info.status !== 200) {
    console.log(`❌ HTTP ${info.status}`);
    process.exit(1);
  }
  console.log("✅ Ulanish OK");
  console.log(`   Model: ${pick(info.text, "model")}`);
  console.log(`   Nomi: ${pick(info.text, "deviceName")}`);
  console.log(`   Serial: ${pick(info.text, "serialNumber")}`);
  console.log(`   Firmware: ${pick(info.text, "firmwareVersion")}`);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const tz = process.env.FACE_TIMEZONE || "+05:00";
  const payload = JSON.stringify({
    AcsEventCond: {
      searchID: "1",
      searchResultPosition: 0,
      maxResults: 5,
      major: 0,
      minor: 0,
      startTime: `${y}-${m}-${d}T00:00:00${tz}`,
      endTime: `${y}-${m}-${d}T23:59:59${tz}`,
      timeReverseOrder: true,
    },
  });
  const evRes = await client.fetch(`http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const evText = await evRes.text();
  if (evRes.ok) {
    const j = JSON.parse(evText);
    const list = j?.AcsEvent?.InfoList;
    const n = list ? (Array.isArray(list) ? list.length : 1) : 0;
    console.log(`✅ Bugungi hodisalar: ${n} ta`);
  } else {
    console.log(`⚠️ AcsEvent HTTP ${evRes.status}`);
  }
} catch (e) {
  console.log(`❌ Xato: ${e.message}`);
  console.log("   Kompyuter 192.168.110.x tarmog'ida ekanligini tekshiring (LAN kabel).");
  process.exit(1);
}
