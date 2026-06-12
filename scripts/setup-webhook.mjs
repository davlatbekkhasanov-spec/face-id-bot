/**
 * Hikvision terminalga webhook (HTTP notification) o'rnatish.
 * .env da FACE_DEVICE_* va WEBHOOK_PUBLIC_URL bo'lishi kerak.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnv();

const ip = (process.env.FACE_DEVICE_IP || "192.168.110.50").trim();
const user = (process.env.FACE_DEVICE_USER || "admin").trim();
const pass = (process.env.FACE_DEVICE_PASSWORD || "").trim();
const publicUrl = (process.env.WEBHOOK_PUBLIC_URL || "").trim().replace(/\/$/, "");
const webhookPath = (process.env.WEBHOOK_PATH || "/webhook/hikvision").trim();

if (!pass) {
  console.error("FACE_DEVICE_PASSWORD .env da yo'q");
  process.exit(1);
}
if (!publicUrl) {
  console.error("WEBHOOK_PUBLIC_URL .env da yo'q (masalan https://xxx.up.railway.app)");
  process.exit(1);
}

const u = new URL(publicUrl);
const host = u.hostname;
const isHttps = u.protocol === "https:";
const port = u.port || (isHttps ? "443" : "80");
const urlPath = webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotificationList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<HttpHostNotification version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>1</id>
<url>${urlPath}</url>
<protocolType>${isHttps ? "HTTPS" : "HTTP"}</protocolType>
<parameterFormatType>XML</parameterFormatType>
<addressingFormatType>hostname</addressingFormatType>
<hostName>${host}</hostName>
<portNo>${port}</portNo>
<httpAuthenticationMethod>none</httpAuthenticationMethod>
</HttpHostNotification>
</HttpHostNotificationList>`;

const client = new DigestFetch(user, pass);

async function req(method, path, body, type = "application/xml") {
  const res = await client.fetch(`http://${ip}${path}`, {
    method,
    headers: { "Content-Type": type },
    body,
  });
  const text = await res.text();
  return { status: res.status, text };
}

console.log(`Terminal: ${ip}`);
console.log(`Webhook:  ${publicUrl}${urlPath}`);

const put = await req("PUT", "/ISAPI/Event/notification/httpHosts", xml);
console.log(`PUT httpHosts -> ${put.status}`);
if (!put.text.includes("OK") && put.status !== 200) {
  console.log(put.text.slice(0, 500));
}

const enable = await req(
  "PUT",
  "/ISAPI/Event/notification/httpHosts/1/test",
  '<?xml version="1.0" encoding="UTF-8"?><HttpHostNotificationTest version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema"/>'
);
console.log(`Test -> ${enable.status}`);

const verify = await req("GET", "/ISAPI/Event/notification/httpHosts");
console.log(`GET httpHosts -> ${verify.status}`);
if (verify.text.includes(host)) {
  console.log("✅ Webhook o'rnatildi!");
} else {
  console.log(verify.text.slice(0, 800));
  console.log("⚠️ Tekshiring — host ko'rinmadi");
}
