/**
 * Hikvision Face ID qidirish (yangi WiFi / IP o'zgarganda)
 */
const SUBNETS = (process.env.SCAN_SUBNET || "192.168.0,192.168.1,192.168.110")
  .split(/[,;]/)
  .map((s) => s.trim())
  .filter(Boolean);

async function probe(ip) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`http://${ip}/ISAPI/System/deviceInfo`, { signal: ctrl.signal });
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

console.log("Face ID qidirilmoqda:", SUBNETS.join(", "));
const jobs = [];
for (const subnet of SUBNETS) {
  for (let i = 1; i <= 254; i++) {
    jobs.push(probe(`${subnet}.${i}`));
  }
}
const results = (await Promise.all(jobs)).filter(Boolean);
if (!results.length) {
  console.log("\n❌ Face ID topilmadi.");
  console.log("   — Do'kon WiFi ga ulanganingizni tekshiring");
  console.log("   — Terminal yoqilganini tekshiring");
  process.exit(1);
}
console.log("\n✅ Topildi:");
for (const r of results) {
  console.log(`   ${r.ip}  ${r.model}  ${r.name}`);
}
console.log("\n.env da FACE_DEVICE_IP= shu IP ni yozing");
