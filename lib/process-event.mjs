import { buildMessage, isFaceEvent } from "./attendance.mjs";
import { wasSerialProcessed, markSerial } from "./db.mjs";

export async function handleFaceEvent(ev, employees, sendFn) {
  if (!isFaceEvent(ev)) return false;
  const serial = Number(ev.serialNo || 0);
  if (serial && wasSerialProcessed(serial)) return false;

  const msg = buildMessage(ev, null, employees);
  if (!msg) return false;
  if (serial) markSerial(serial);

  await sendFn(msg);
  return true;
}
