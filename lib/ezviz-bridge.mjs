/** Face ID keldi → EZVIZ camera bot (Railway). Fire-and-forget. */

export function ezvizBridgeConfigured() {
  const url = (process.env.EZVIZ_BRIDGE_URL || "").trim();
  const secret = (process.env.EZVIZ_BRIDGE_SECRET || process.env.BRIDGE_SECRET || "").trim();
  return Boolean(url);
}

export function notifyEzvizBridge(card) {
  const url = (process.env.EZVIZ_BRIDGE_URL || "").trim().replace(/\/$/, "");
  if (!url) return;
  if (!["arrived", "returned", "left"].includes(card.kind)) return;

  const secret = (process.env.EZVIZ_BRIDGE_SECRET || process.env.BRIDGE_SECRET || "").trim();
  const payload = {
    employeeName: card.staffName || card.staffKey,
    staffKey: card.staffKey,
    kind: card.kind,
    clock: card.clock || "",
    zone: card.zone || process.env.EZVIZ_DEFAULT_ZONE || "",
  };

  const headers = { "Content-Type": "application/json" };
  if (secret) headers["x-bridge-secret"] = secret;

  fetch(`${url}/event`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => console.warn("EZVIZ bridge:", e.message));
}
