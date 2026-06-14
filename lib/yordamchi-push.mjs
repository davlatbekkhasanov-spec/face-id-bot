/** Face ID ball → yordamchi hub (period reyting) */

const DEFAULT_HUB = "https://davlat-yordamchi-bot-production.up.railway.app";

export function hubConfigured() {
  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB).trim();
  const secret = (process.env.YORDAMCHI_HUB_SECRET || process.env.HUB_SECRET || "").trim();
  return Boolean(url && secret);
}

export function hubStatusLabel() {
  if (!hubConfigured()) return "hub: SECRET yo'q (yordamchi reyting ishlamaydi)";
  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB).trim();
  return `hub: OK → ${url.replace(/^https?:\/\//, "").split("/")[0]}`;
}

export function buildFaceIdHubSummary(breakdown) {
  const b = breakdown || {};
  const dayTotal = Number(b.day_total) || 0;
  const late = Number(b.late_penalty) || 0;
  const debt = Number(b.debt_penalty) || 0;
  const bonus = Number(b.overtime_bonus) || 0;
  return `Face ID: ball=${dayTotal} kech=${late} qarz=${debt} bonus=${bonus}`;
}

export async function pushFaceIdToHub({ telegramId, dayKey, breakdown }) {
  if (!telegramId) return { ok: false, reason: "telegramId yo'q" };
  if (!hubConfigured()) return { ok: false, reason: "hub sozlanmagan" };

  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB)
    .trim()
    .replace(/\/$/, "");
  const secret = (process.env.YORDAMCHI_HUB_SECRET || process.env.HUB_SECRET || "").trim();
  const summary = buildFaceIdHubSummary(breakdown);
  const payload = {
    tg_id: Number(telegramId),
    bot_key: "faceid",
    summary,
    day: dayKey,
  };

  try {
    const res = await fetch(`${url}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Secret": secret,
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.message || res.statusText };
    }
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** Bugungi barcha hodimlar — deploy/keyingi sync */
export async function syncTodayPointsToHub(employees) {
  if (!hubConfigured()) return { ok: false, pushed: 0 };
  const { dayKey } = await import("./period.mjs");
  const { listDailyPointsForDay } = await import("./points-db.mjs");
  const dk = dayKey();
  const rows = listDailyPointsForDay(dk);
  let pushed = 0;
  for (const row of rows) {
    const tg = employees.staff?.[row.staff_key]?.telegramId;
    if (!tg) continue;
    const r = await pushFaceIdToHub({
      telegramId: tg,
      dayKey: dk,
      breakdown: row,
    });
    if (r.ok) pushed += 1;
  }
  return { ok: true, pushed };
}
