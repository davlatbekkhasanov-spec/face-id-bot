export const PING_LABEL_W = 23;

export function pingRow(label, value) {
  return `${String(label).padEnd(PING_LABEL_W)} | ${value}`;
}

export function pingRule(valueWidth = 18) {
  return `${"-".repeat(PING_LABEL_W)}-|-${"-".repeat(valueWidth)}`;
}

export function pingHeader() {
  return [pingRow("Ko'rsatkich", "Qiymat"), pingRule()];
}

/** Ping kartochka jadvali — attendance va admin hisobotlar */
export function formatPingTable(rows) {
  const width = Math.max(...rows.map((r) => r.length), 0);
  const pad = (s, w) => String(s).padEnd(w);
  const top = `┏${"━".repeat(width + 2)}┓`;
  const mid = rows.map((r) => `┃ ${pad(r, width)} ┃`);
  const bottom = `┗${"━".repeat(width + 2)}┛`;
  return `<pre>${[top, ...mid, bottom].join("\n")}</pre>`;
}
