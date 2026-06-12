/**
 * 192.168.110.x tarmog'ida Hikvision access terminal qidirish.
 * Kameralar (100-132) o'tkazib yuboriladi.
 */
const SUBNET = process.env.SCAN_SUBNET || "192.168.110";
const SKIP = new Set(
  Array.from({ length: 33 }, (_, i) => `${SUBNET}.${100 + i}`)
);

async function probe(ip) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await fetch(`http://${ip}/ISAPI/System/deviceInfo`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 401 || res.status === 200) {
      const text = await res.text();
      const model = text.match(/<model>([^<]+)</)?.[1] || "?";
      const name = text.match(/<deviceName>([^<]+)</)?.[1] || "?";
      return { ip, status: res.status, model, name };
    }
  } catch {
    clearTimeout(t);
  }
  return null;
}

console.log(`Skaner: ${SUBNET}.1-254 (kameralar 100-132 tashqari)...`);
const jobs = [];
for (let i = 1; i <= 254; i++) {
  const ip = `${SUBNET}.${i}`;
  if (SKIP.has(ip)) continue;
  jobs.push(probe(ip));
}
const results = (await Promise.all(jobs)).filter(Boolean);
if (!results.length) {
  console.log("Hech narsa topilmadi. LAN kabel va tarmoqni tekshiring.");
  process.exit(1);
}
for (const r of results) {
  const auth = r.status === 401 ? "Hikvision (parol kerak)" : "OK";
  console.log(`${r.ip}  ${r.model}  ${r.name}  [${auth}]`);
}
