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

/** Barcha caption vaqt ko'rsatkichlari — bir xil yaxlitlash */
export function fmtDurationNorm(ms) {
  if (ms <= 0) return "0 daqiqa";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} daqiqa`;
  if (m === 0) return `${h} soat`;
  return `${h} soat ${m} daqiqa`;
}

export function fmtDurationClock(ms) {
  return fmtDurationNorm(ms);
}

/** Hisobot oyi: 3-sanadan keyingi oy 2-sanasigacha */
export function periodDayKeys(pk, upToMs = Date.now()) {
  const [y, m] = pk.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const start = new Date(`${y}-${pad(m)}-03T12:00:00+05:00`).getTime();
  let nm = m + 1;
  let ny = y;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const periodEnd = new Date(`${ny}-${pad(nm)}-02T23:59:59+05:00`).getTime();
  const endMs = Math.min(periodEnd, upToMs);
  const keys = [];
  for (let t = start; t <= endMs; t += 86_400_000) {
    keys.push(dayKey(t));
  }
  return keys;
}

export function dayNumberFromKey(dk) {
  return Number(String(dk || "").split("-")[2] || 0);
}

/** Qisqa: "2s 15m" */
export function fmtHoursShort(ms) {
  if (!ms || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}s`;
  return `${h}s ${m}m`;
}

const MONTHS_UZ_CAP = [
  "", "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

export function monthLabel(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_UZ_CAP[m]} ${y}`;
}

export function daysInCalendarMonth(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dayKeyFromParts(ym, dayNum) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${ym}-${pad(dayNum)}`;
}

/** fromKey/toKey: YYYY-MM-DD inclusive */
export function dayKeysInRange(fromKey, toKey) {
  const pad = (n) => String(n).padStart(2, "0");
  const start = new Date(`${fromKey}T12:00:00+05:00`).getTime();
  const end = new Date(`${toKey}T12:00:00+05:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const keys = [];
  for (let t = start; t <= end; t += 86_400_000) {
    keys.push(dayKey(t));
  }
  return keys;
}

export function fmtRangeLabel(fromKey, toKey) {
  const fmt = (dk) => {
    const [y, m, d] = dk.split("-");
    return `${Number(d)} ${MONTHS_UZ_CAP[Number(m)].toLowerCase()} ${y}`;
  };
  if (fromKey === toKey) return fmt(fromKey);
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (fy === ty && fm === tm) {
    return `${fd}—${td} ${MONTHS_UZ_CAP[fm].toLowerCase()} ${fy}`;
  }
  return `${fmt(fromKey)} — ${fmt(toKey)}`;
}
