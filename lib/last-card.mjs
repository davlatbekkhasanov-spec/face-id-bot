import fs from "fs";
import path from "path";

function file(dataDir) {
  return path.join(dataDir, "last-card.json");
}

export function saveLastCard(dataDir, card, photoPath) {
  fs.writeFileSync(
    file(dataDir),
    JSON.stringify({ card, photoPath, savedAt: Date.now() }, null, 0)
  );
}

export function loadLastCard(dataDir) {
  try {
    const p = file(dataDir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
