/** Deploydan keyin SQLite va config yo'qolmasin — volume, migratsiya, startup zaxira. */
import fs from "fs";
import path from "path";

const DEFAULT_DATA_DIR = "/data";
const STARTUP_BACKUP_KEEP = Math.max(5, Number(process.env.STARTUP_BACKUP_KEEP || 30));

export function hasRailwayVolume() {
  return Boolean((process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim());
}

export function resolveDataDir(fallbackDir) {
  const fromEnv = (process.env.DATABASE_DIR || process.env.DATA_DIR || "").trim();
  if (fromEnv) return fromEnv;
  const mount = (process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
  if (mount) return mount;
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID) return DEFAULT_DATA_DIR;
  return fallbackDir;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function copyIfMissing(src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return null;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return src;
}

function migrateLegacyDb(dataDir, bundledDir) {
  const target = path.join(dataDir, "faceid.db");
  if (fileSize(target) > 512) return null;

  const candidates = [
    path.join(bundledDir, "faceid.db"),
    path.join(bundledDir, "data", "faceid.db"),
    path.join(process.cwd(), "data", "faceid.db"),
    path.join("/app", "data", "faceid.db"),
  ];

  for (const src of candidates) {
    if (!fs.existsSync(src) || fileSize(src) < 1) continue;
    ensureDir(dataDir);
    fs.copyFileSync(src, target);
    console.warn("DB migratsiya:", src, "->", target);
    return src;
  }
  return null;
}

function migrateLegacyJson(dataDir, bundledDir, name) {
  const target = path.join(dataDir, name);
  if (fileSize(target) > 32) return null;
  return copyIfMissing(path.join(bundledDir, name), target);
}

function pruneBackups(dir, prefix, keep) {
  try {
    const names = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(prefix))
      .sort()
      .reverse();
    for (const old of names.slice(keep)) {
      try {
        fs.unlinkSync(path.join(dir, old));
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function stamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}`;
}

function startupBackupFile(src, backupDir, prefix) {
  if (!fs.existsSync(src) || fileSize(src) < 1) return null;
  ensureDir(backupDir);
  const ext = path.extname(src) || ".bin";
  const dest = path.join(backupDir, `${prefix}${stamp()}${ext}`);
  fs.copyFileSync(src, dest);
  console.log("Startup zaxira:", dest);
  pruneBackups(backupDir, prefix, STARTUP_BACKUP_KEEP);
  return dest;
}

export function bootstrapPersistence(dataDir, bundledDir) {
  ensureDir(dataDir);
  const migratedDbFrom = migrateLegacyDb(dataDir, bundledDir);
  const migratedEmpFrom = migrateLegacyJson(dataDir, bundledDir, "employees.json");

  const dbPath = path.join(dataDir, "faceid.db");
  const backupDir = path.join(dataDir, "backups");
  const startupBackup = startupBackupFile(dbPath, backupDir, "startup_");
  const empBackup = startupBackupFile(path.join(dataDir, "employees.json"), backupDir, "employees_");

  const volume = hasRailwayVolume();
  if (!volume && dataDir.startsWith("/data")) {
    console.error(
      "RAILWAY VOLUME YO'Q — deploydan keyin /data o'chadi! Railway: Service -> Volumes -> Add -> Mount path /data"
    );
  }

  return {
    dataDir,
    dbPath,
    volume,
    migratedDbFrom,
    migratedEmpFrom,
    startupBackup,
    empBackup,
  };
}

export function persistenceStatusLine(dataDir, dbPath) {
  const vol = hasRailwayVolume();
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH || "—";
  const sizeKb = Math.floor(fileSize(dbPath) / 1024);
  return `DB: ${dbPath} (${sizeKb} KB) · Volume: ${vol ? "OK" : "YOQ"} (${mount})`;
}
