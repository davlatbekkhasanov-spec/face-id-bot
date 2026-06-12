import { getMeta, setMeta, markSerial, wasSerialProcessed } from "./db.mjs";
import { eventTimeMs } from "./attendance-core.mjs";

const KEY = "poll_watermark_ms";

export function getPollWatermarkMs() {
  return Number(getMeta(KEY) || 0);
}

export function setPollWatermarkMs(ms = Date.now()) {
  setMeta(KEY, String(ms));
}

/** Eski hodisalarni o'tkazib yuborish (reset/restart dan keyin spam bo'lmasin) */
export function skipOldEvent(ev, watermarkMs) {
  const wm = watermarkMs ?? getPollWatermarkMs();
  if (!wm) return false;
  const evMs = eventTimeMs(ev);
  if (evMs >= wm) return false;
  const serial = Number(ev.serialNo || 0);
  if (serial && !wasSerialProcessed(serial)) markSerial(serial);
  return true;
}

/** Bugungi barcha serialNo larni «ishlangan» deb belgilash */
export function markSerialsProcessed(events) {
  for (const ev of events) {
    const serial = Number(ev.serialNo || 0);
    if (serial) markSerial(serial);
  }
}
