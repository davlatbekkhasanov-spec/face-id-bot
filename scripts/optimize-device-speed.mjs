/**
 * Terminal yuz tanish tezligini oshirish (xavfsiz sozlamalar).
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

const ip = process.env.FACE_DEVICE_IP || "192.168.0.28";
const client = new DigestFetch(process.env.FACE_DEVICE_USER || "admin", process.env.FACE_DEVICE_PASSWORD || "");

async function put(pathname, body) {
  const res = await client.fetch(`http://${ip}${pathname}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

const reader = JSON.parse(
  await (await client.fetch(`http://${ip}/ISAPI/AccessControl/CardReaderCfg/1?format=json`)).text()
).CardReaderCfg;

reader.faceRecogizeInterval = 1;
reader.faceRecogizeTimeOut = 2;
reader.faceMatchThresholdN = 85;
reader.faceMatchThreshold1 = 85;

await put("/ISAPI/AccessControl/CardReaderCfg/1?format=json", { CardReaderCfg: reader });

const acs = JSON.parse(
  await (await client.fetch(`http://${ip}/ISAPI/AccessControl/AcsCfg?format=json`)).text()
).AcsCfg;
acs.needDeviceCheck = false;

await put("/ISAPI/AccessControl/AcsCfg?format=json", { AcsCfg: acs });

console.log("OK: interval=1s, timeout=2s, threshold=85, remoteCheck=off");
