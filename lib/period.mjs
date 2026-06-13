export const TZ = "Asia/Tashkent";
export const SHIFT_MS = 12 * 60 * 60 * 1000;
export const COOLDOWN_MS = Math.max(
  10_000,
  Number(process.env.SCAN_COOLDOWN_SEC || 25) * 1000
);

export function tashkentParts(ms = Date.now()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = f.format(new Date(ms)).split("-").map(Number);
  return { y, m, d };
}

/** 3-sanadan yangi oy; 1–2-sana oldingi oy yopiladi */
export function periodKey(ms = Date.now()) {
  let { y, m, d } = tashkentParts(ms);
  if (d < 3) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function dayKey(ms = Date.now()) {
  const { y, m, d } = tashkentParts(ms);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function periodLabel(key) {
  const [y, m] = key.split("-");
  const months = [
    "", "январ", "феврал", "март", "апрел", "май", "июн",
    "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
  ];
  return `${months[Number(m)]} ${y}`;
}

export function fmtDuration(ms) {
  if (ms <= 0) return "0 дақиқа";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} дақиқа`;
  if (m === 0) return `${h} соат`;
  return `${h} соат ${m} дақиқа`;
}

/** Smena farqi — ekrandagi soat:daqiqa bo'yicha (soniyalar chalkitmasin) */
export function fmtDurationClock(ms) {
  if (ms <= 0) return "0 дақиқа";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} дақиқа`;
  if (m === 0) return `${h} соат`;
  return `${h} соат ${m} дақиқа`;
}
