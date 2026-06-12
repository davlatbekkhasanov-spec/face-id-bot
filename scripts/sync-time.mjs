/** Terminal vaqtini Toshkent (+05:00) ga sozlash */
import DigestFetch from "digest-fetch";

const ip = process.env.FACE_DEVICE_IP || "192.168.0.28";
const client = new DigestFetch(
  process.env.FACE_DEVICE_USER || "admin",
  process.env.FACE_DEVICE_PASSWORD || "2024DAVL"
);

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tashkent",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})
  .formatToParts(new Date())
  .reduce((a, p) => ({ ...a, [p.type]: p.value }), {});

const localTime = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:00`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<timeMode>manual</timeMode>
<localTime>${localTime}</localTime>
<timeZone>STD-5:00:00</timeZone>
</Time>`;

const res = await client.fetch(`http://${ip}/ISAPI/System/time`, {
  method: "PUT",
  headers: { "Content-Type": "application/xml" },
  body: xml,
});
const text = await res.text();
console.log("Vaqt:", res.status, localTime);
if (!text.includes("OK") && res.status !== 200) console.log(text.slice(0, 300));

const chk = await client.fetch(`http://${ip}/ISAPI/System/time`);
console.log((await chk.text()).slice(0, 400));
