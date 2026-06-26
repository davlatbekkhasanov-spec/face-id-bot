/** Mavjud hodim yuzini almashtirish — --only=924612402 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import sharp from "sharp";
import { loadEmployeesFile } from "../lib/register-wizard.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const ip = process.env.FACE_DEVICE_IP;
const pass = process.env.FACE_DEVICE_PASSWORD;
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] || "924612402";
const client = new DigestFetch(process.env.FACE_DEVICE_USER || "admin", pass);
const FDID = "1";

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
  return { status: res.status, text, json };
}

function ok(r) {
  const sc = r.json?.statusCode ?? r.json?.UserInfoSearch?.responseStatusStrg;
  return r.status === 200 && (sc === 1 || sc === "OK" || sc === undefined);
}

async function deleteFace(FPID) {
  const body = JSON.stringify({
    FaceDataRecord: { faceLibType: "blackFD", FDID, FPID: String(FPID) },
  });
  return api("PUT", "/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json", body, "application/json");
}

async function uploadFace(FPID, jpegBuf) {
  const boundary = `----Hikvision${Date.now()}`;
  const meta = JSON.stringify({ faceLibType: "blackFD", FDID, FPID: String(FPID) });
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
  return api(
    "PUT",
    "/ISAPI/Intelligent/FDLib/FDModify?format=json",
    Buffer.concat([head, jpegBuf, tail]),
    `multipart/form-data; boundary=${boundary}`
  );
}

async function modifyUser(employeeNo, name) {
  const body = JSON.stringify({
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
  });
  return api("PUT", "/ISAPI/AccessControl/UserInfo/Modify?format=json", body, "application/json");
}

const { staff } = loadEmployeesFile(path.join(root, "data"));
const s = staff[only];
if (!s) {
  console.error("Hodim topilmadi:", only);
  process.exit(1);
}
const name = s.deviceName || `${s.lastName} ${s.firstName}`.toUpperCase();
const facePath = path.join(root, "data", s.photoFile || `faces/${only}.jpg`);
const jpeg = await sharp(facePath)
  .rotate()
  .resize(640, 640, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 88 })
  .toBuffer();

console.log(`Terminal: ${ip} | ${name} (${only})`);

const userR = await modifyUser(only, name);
console.log("user:", ok(userR) ? "OK" : userR.text.slice(0, 200));

let delR = await deleteFace(only);
console.log("delete:", ok(delR) ? "OK" : delR.text.slice(0, 200));

let upR = await uploadFace(only, jpeg);
if (!ok(upR)) {
  // delete + post yangi
  delR = await deleteFace(only);
  console.log("delete2:", ok(delR) ? "OK" : delR.text.slice(0, 120));
  const boundary = `----Hikvision${Date.now()}`;
  const meta = JSON.stringify({ faceLibType: "blackFD", FDID, FPID: String(only) });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Disposition: form-data; name="FaceImage"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  upR = await api(
    "POST",
    "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
    Buffer.concat([head, jpeg, tail]),
    `multipart/form-data; boundary=${boundary}`
  );
}
console.log("face:", ok(upR) ? `OK (${jpeg.length} bytes)` : upR.text.slice(0, 300));
process.exit(ok(upR) ? 0 : 1);
