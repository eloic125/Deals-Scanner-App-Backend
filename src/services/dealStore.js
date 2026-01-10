import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE } from "../config/paths.js";

/* =====================================================
   COUNTRY-SPLIT DEAL STORE (US + CA)
   - Two physically separate JSON files on disk
   - Same schema per file
   - Public/admin code selects the file by country
   - Default country: CA (safe)
===================================================== */

/* =====================================================
   FILE PATHS
===================================================== */

function normalizeCountry(input) {
  const c = String(input || "").trim().toUpperCase();
  return c === "US" ? "US" : "CA";
}

function buildCountryFile(baseFilePath, country) {
  // If DEALS_FILE is ".../deals.json" -> ".../deals-US.json" / ".../deals-CA.json"
  // If DEALS_FILE has no ".json", still works.
  const c = normalizeCountry(country);
  const dir = path.dirname(baseFilePath);
  const ext = path.extname(baseFilePath) || ".json";
  const base = path.basename(baseFilePath, ext) || "deals";
  return path.join(dir, `${base}-${c}${ext}`);
}

function getActiveDealsFile(country) {
  return buildCountryFile(DEALS_FILE, country);
}

function getBackupFile(activeFile) {
  return `${activeFile}.bak`;
}

/* =====================================================
   LOGGING
===================================================== */

console.log("💾 Deal store base file:", DEALS_FILE);
console.log("💾 Deal store US file:", getActiveDealsFile("US"));
console.log("💾 Deal store CA file:", getActiveDealsFile("CA"));

/* =====================================================
   AUTO-MIGRATION (SINGLE FILE -> CA FILE)
   - Your existing setup had one ACTIVE file (DEALS_FILE)
   - We migrate that data into the CA file only (safe default)
   - We also migrate from older legacy locations into CA
   - We NEVER merge into US unless you explicitly do a backfill later
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

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !String(raw).trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWriteJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function hasDealsData(obj) {
  return !!obj && Array.isArray(obj.deals) && obj.deals.length > 0;
}

function migrateSingleStoreToCA() {
  try {
    const CA_FILE = getActiveDealsFile("CA");
    const CA_EXISTS = fs.existsSync(CA_FILE);
    const CA_COUNT = CA_EXISTS ? readDealsCount(CA_FILE) : 0;

    // Candidate sources (highest priority first)
    // 1) Current "single store" file (DEALS_FILE) if it exists (common in your current setup)
    // 2) Older legacy locations you already supported
    const CANDIDATES = [
      DEALS_FILE,
      path.join(process.cwd(), "src", "data", "deals.json"),
      path.join(process.cwd(), "src", "src", "data", "deals.json"),
    ];

    console.log("🔍 Checking migration candidates:", CANDIDATES);

    // Find first candidate that exists and has deals
    let source = null;
    let sourceCount = 0;

    for (const f of CANDIDATES) {
      if (!fs.existsSync(f)) continue;
      const cnt = readDealsCount(f);
      if (cnt > 0) {
        source = f;
        sourceCount = cnt;
        break;
      }
    }

    if (!source) {
      console.log("⚠️ Migration skipped: no source file with deals found.");
      return;
    }

    // Only migrate into CA if CA doesn't exist OR CA is empty
    // This avoids overwriting a populated CA file.
    if (!CA_EXISTS || CA_COUNT === 0) {
      const parsed = safeReadJson(source);

      if (!parsed || !hasDealsData(parsed)) {
        console.log("⚠️ Migration skipped: source parse failed or has no deals.");
        return;
      }

      // Ensure schema: deals/reports/alerts
      const out = {
        updatedAt: new Date().toISOString(),
        deals: Array.isArray(parsed.deals) ? parsed.deals : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      };

      // IMPORTANT: default everything to CA if missing, but do NOT rewrite
      // deal.country here—keep deal objects unchanged (smallest change).
      // Your routes already default missing country to CA safely.
      safeWriteJson(CA_FILE, out);

      console.log("✨ Migrated single-store deals into CA file:", {
        from: source,
        to: CA_FILE,
        sourceCount,
        previousCACount: CA_COUNT,
        newCACount: out.deals.length,
      });
    } else {
      console.log("⚠️ Migration skipped confirm:", {
        caFileExists: CA_EXISTS,
        caCount: CA_COUNT,
        foundSource: source,
        sourceCount,
      });
    }
  } catch (err) {
    console.warn("Migration failed:", err?.message || err);
  }
}

migrateSingleStoreToCA();

/* =====================================================
   FILE INIT (PER COUNTRY)
===================================================== */

function ensureStore(country = "CA") {
  const c = normalizeCountry(country);
  const ACTIVE_DEALS_FILE = getActiveDealsFile(c);

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
          alerts: [],
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

  return crypto.createHash("sha1").update(JSON.stringify(deal)).digest("hex");
}

/* =====================================================
   INTERNAL BACKUP (PER COUNTRY)
===================================================== */

function backupCurrentFile(activeFile) {
  try {
    const backupFile = getBackupFile(activeFile);
    if (fs.existsSync(activeFile)) {
      fs.copyFileSync(activeFile, backupFile);
      console.log("📦 Backup created:", backupFile);
    }
  } catch (err) {
    console.warn("Backup failed:", err?.message || err);
  }
}

/* =====================================================
   READ (DEFAULT CA)
   - Signature supports optional country:
     readDeals() -> CA
     readDeals("US") -> US
===================================================== */

export function readDeals(country = "CA") {
  const c = normalizeCountry(country);
  const ACTIVE_DEALS_FILE = getActiveDealsFile(c);

  ensureStore(c);

  try {
    const raw = fs.readFileSync(ACTIVE_DEALS_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    };
  } catch (err) {
    console.error("readDeals failed:", err);

    return {
      updatedAt: new Date().toISOString(),
      deals: [],
      reports: [],
      alerts: [],
    };
  }
}

/* =====================================================
   WRITE — PROTECTED (DEFAULT CA)
   - Signature supports optional country:
     writeDeals(storeOrDealsArray) -> CA
     writeDeals("US", storeOrDealsArray) -> US
===================================================== */

function parseWriteArgs(a, b) {
  // Supports:
  //   writeDeals(input)
  //   writeDeals(country, input)
  // Where country is "US" or "CA".
  if (typeof a === "string" && b !== undefined) {
    return { country: normalizeCountry(a), input: b };
  }
  return { country: "CA", input: a };
}

export function writeDeals(a, b) {
  const { country, input } = parseWriteArgs(a, b);

  const c = normalizeCountry(country);
  const ACTIVE_DEALS_FILE = getActiveDealsFile(c);

  ensureStore(c);

  const current = readDeals(c);
  const currentDeals = Array.isArray(current.deals) ? current.deals : [];
  const currentReports = Array.isArray(current.reports) ? current.reports : [];
  const currentAlerts = Array.isArray(current.alerts) ? current.alerts : [];

  let deals = [];
  let reports = currentReports;
  let alerts = currentAlerts;

  if (Array.isArray(input)) {
    deals = input;
  } else if (input && typeof input === "object") {
    deals = Array.isArray(input.deals) ? input.deals : [];
    reports = Array.isArray(input.reports) ? input.reports : currentReports;
    alerts = Array.isArray(input.alerts) ? input.alerts : currentAlerts;
  } else {
    console.error("writeDeals: invalid input ignored");
    return;
  }

  // Protection: never wipe a non-empty store with empty deals
  if (currentDeals.length > 0 && deals.length === 0) {
    console.warn(
      "⚠️ writeDeals blocked — attempted to overwrite non-empty store with empty deals.",
      { country: c, file: ACTIVE_DEALS_FILE }
    );
    return;
  }

  backupCurrentFile(ACTIVE_DEALS_FILE);

  fs.writeFileSync(
    ACTIVE_DEALS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        deals,
        reports,
        alerts,
      },
      null,
      2
    )
  );
}

/* =====================================================
   UPSERT (DEFAULT CA)
   - Signature supports optional country:
     upsertDeals(incoming) -> CA
     upsertDeals("US", incoming) -> US
===================================================== */

function parseUpsertArgs(a, b) {
  // Supports:
  //   upsertDeals(incoming)
  //   upsertDeals(country, incoming)
  if (typeof a === "string" && b !== undefined) {
    return { country: normalizeCountry(a), incoming: b };
  }
  return { country: "CA", incoming: a };
}

export function upsertDeals(a, b) {
  const { country, incoming } = parseUpsertArgs(a, b);

  if (!Array.isArray(incoming)) {
    throw new Error("upsertDeals expects an array");
  }

  const c = normalizeCountry(country);

  const store = readDeals(c);
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

  writeDeals(c, {
    deals: merged,
    reports: store.reports || [],
    alerts: store.alerts || [],
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
