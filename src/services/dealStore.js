import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE } from "../config/paths.js";

/* =====================================================
   ACTIVE DATA FILE
===================================================== */

const ACTIVE_DEALS_FILE = DEALS_FILE;
const BACKUP_FILE = `${ACTIVE_DEALS_FILE}.bak`;

console.log("💾 Using deals file:", ACTIVE_DEALS_FILE);

/* =====================================================
   AUTO-MIGRATION (COPY OLD FILE → DISK)
   - If new file is missing OR empty
   - And old file exists with deals
   → Copy old → new
===================================================== */

function readDealsCount(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.deals) ? parsed.deals.length : 0;
  } catch {
    return 0;
  }
}

try {
  // Possible old locations
  const OLD_FILES = [
    path.join(process.cwd(), "src", "data", "deals.json"),
    path.join(process.cwd(), "src", "src", "data", "deals.json"),
  ];

  console.log("🔍 Checking migration locations:", OLD_FILES);

  const oldFile = OLD_FILES.find(f => fs.existsSync(f));
  const newExists = fs.existsSync(ACTIVE_DEALS_FILE);

  const oldCount = oldFile ? readDealsCount(oldFile) : 0;
  const newCount = newExists ? readDealsCount(ACTIVE_DEALS_FILE) : 0;

  let shouldMigrate = false;

  // Case 1: no new file, but old file has deals
  if (!newExists && oldFile && oldCount > 0) {
    shouldMigrate = true;
  }

  // Case 2: new file exists but is empty, old file has deals
  if (newExists && newCount === 0 && oldFile && oldCount > 0) {
    shouldMigrate = true;
  }

  if (shouldMigrate && oldFile) {
    fs.mkdirSync(path.dirname(ACTIVE_DEALS_FILE), { recursive: true });
    fs.copyFileSync(oldFile, ACTIVE_DEALS_FILE);
    console.log(
      "✨ Migrated deals.json to disk:",
      { from: oldFile, to: ACTIVE_DEALS_FILE, oldCount, newCount }
    );
  } else {
    console.log("⚠️ Migration skipped. Status:", {
      newFileExists: newExists,
      newCount,
      foundOldFile: oldFile,
      oldCount,
    });
  }
} catch (err) {
  console.warn("Migration failed:", err.message);
}

/* =====================================================
   FILE INIT
===================================================== */

function ensureStore() {
  const dir = path.dirname(ACTIVE_DEALS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(ACTIVE_DEALS_FILE)) {
    fs.writeFileSync(
      ACTIVE_DEALS_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          deals: [],
          reports: [],
        },
        null,
        2
      )
    );
  }
}

/* =====================================================
   HELPERS
===================================================== */

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return null;
  }
}

/* =====================================================
   UNIQUE DEAL KEY
===================================================== */

export function getDealKey(deal) {
  if (!deal) return null;

  if (deal.sourceKey) return `source:${deal.sourceKey}`;
  if (deal.asin) return `asin:${deal.asin}`;

  const u = normalizeUrl(deal.url);
  if (u) return `url:${u}`;

  if (deal.title) return `title:${normalize(deal.title)}`;

  return crypto
    .createHash("sha1")
    .update(JSON.stringify(deal))
    .digest("hex");
}

/* =====================================================
   READ
===================================================== */

export function readDeals() {
  ensureStore();

  try {
    const raw = fs.readFileSync(ACTIVE_DEALS_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch (err) {
    console.error("readDeals failed:", err);

    return {
      updatedAt: new Date().toISOString(),
      deals: [],
      reports: [],
    };
  }
}

/* =====================================================
   INTERNAL BACKUP
===================================================== */

function backupCurrentFile() {
  try {
    if (fs.existsSync(ACTIVE_DEALS_FILE)) {
      fs.copyFileSync(ACTIVE_DEALS_FILE, BACKUP_FILE);
      console.log("📦 Backup created:", BACKUP_FILE);
    }
  } catch (err) {
    console.warn("Backup failed:", err.message);
  }
}

/* =====================================================
   WRITE — PROTECTED
===================================================== */

export function writeDeals(input) {
  ensureStore();

  const current = readDeals();
  const currentDeals = Array.isArray(current.deals) ? current.deals : [];
  const currentReports = Array.isArray(current.reports) ? current.reports : [];

  let deals = [];
  let reports = currentReports;

  if (Array.isArray(input)) {
    deals = input;
  } else if (input && typeof input === "object") {
    deals = Array.isArray(input.deals) ? input.deals : [];
    reports = Array.isArray(input.reports) ? input.reports : currentReports;
  } else {
    console.error("writeDeals: invalid input ignored");
    return;
  }

  if (currentDeals.length > 0 && deals.length === 0) {
    console.warn(
      "⚠️ writeDeals blocked — attempted to overwrite non-empty store with empty deals."
    );
    return;
  }

  backupCurrentFile();

  fs.writeFileSync(
    ACTIVE_DEALS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        deals,
        reports,
      },
      null,
      2
    )
  );
}

/* =====================================================
   UPSERT
===================================================== */

export function upsertDeals(incoming = []) {
  if (!Array.isArray(incoming)) {
    throw new Error("upsertDeals expects an array");
  }

  const store = readDeals();
  const existing = Array.isArray(store.deals) ? store.deals : [];
  const map = new Map();

  for (const d of existing) {
    map.set(getDealKey(d), d);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const raw of incoming) {
    if (!raw) continue;

    const key = getDealKey(raw);
    if (!key) continue;

    const now = new Date().toISOString();

    if (map.has(key)) {
      const current = map.get(key);

      map.set(key, {
        ...current,
        ...raw,
        id: current.id,
        status: current.status || "approved",
        updatedAt: now,
      });

      updatedCount++;
    } else {
      map.set(key, {
        id: crypto.randomUUID(),
        status: raw.status || "approved",
        expiresAt: raw.expiresAt || null,
        createdAt: now,
        updatedAt: now,
        ...raw,
      });

      addedCount++;
    }
  }

  const merged = Array.from(map.values());

  writeDeals({
    deals: merged,
    reports: store.reports || [],
  });

  return { ok: true, addedCount, updatedCount, total: merged.length };
}

/* =====================================================
   RESET (disabled)
===================================================== */

export function resetDeals() {
  console.warn("⚠️ resetDeals called — NOT allowed in production.");
  return { ok: false, message: "Reset disabled in production." };
}
