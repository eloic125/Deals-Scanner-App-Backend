// FILE: src/services/dealStore.js
// FULL FILE — DROP-IN REPLACEMENT — NO SELF-IMPORTS
//
// FIXES YOUR DEPLOY ERROR:
// - Removes the accidental self-import that caused:
//   "does not provide an export named 'readDeals'"
// - Ensures named exports exist: readDeals, writeDeals, upsertDeals, getDealKey, resetDeals
// - Keeps strict country-split files: deals-CA.json and deals-US.json
// - Creates both files on boot
// - Safe read/write + backup
// - Prevents wiping non-empty store with empty writes
//
// IMPORTANT:
// - Do NOT import readDeals/writeDeals from this file INSIDE this file.
// - Other files should import like:
//     import { readDeals, writeDeals } from "../services/dealStore.js";

import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE } from "../config/paths.js";

/* =====================================================
   COUNTRY NORMALIZATION
===================================================== */

function normalizeCountry(input) {
  const c = String(input || "").trim().toUpperCase();
  return c === "US" ? "US" : "CA";
}

/* =====================================================
   FILE PATHS
===================================================== */

function buildCountryFile(baseFilePath, country) {
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
   LOGGING (SAFE)
===================================================== */

console.log("💾 Deal store base file:", DEALS_FILE);
console.log("💾 Deal store US file:", getActiveDealsFile("US"));
console.log("💾 Deal store CA file:", getActiveDealsFile("CA"));

/* =====================================================
   SAFE JSON HELPERS
===================================================== */

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

function hasDealsData(obj) {
  return !!obj && Array.isArray(obj.deals) && obj.deals.length > 0;
}

/* =====================================================
   AUTO-MIGRATION (SINGLE FILE -> CA FILE)
   - Migrates legacy single-store deals into CA ONLY
===================================================== */

function migrateSingleStoreToCA() {
  try {
    const CA_FILE = getActiveDealsFile("CA");
    const CA_EXISTS = fs.existsSync(CA_FILE);
    const CA_COUNT = CA_EXISTS ? readDealsCount(CA_FILE) : 0;

    const CANDIDATES = [
      DEALS_FILE,
      path.join(process.cwd(), "src", "data", "deals.json"),
      path.join(process.cwd(), "src", "src", "data", "deals.json"),
    ];

    console.log("🔍 Checking migration candidates:", CANDIDATES);

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

    if (!CA_EXISTS || CA_COUNT === 0) {
      const parsed = safeReadJson(source);

      if (!parsed || !hasDealsData(parsed)) {
        console.log("⚠️ Migration skipped: source parse failed or has no deals.");
        return;
      }

      const out = {
        updatedAt: new Date().toISOString(),
        deals: Array.isArray(parsed.deals) ? parsed.deals : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      };

      // Do NOT rewrite deal.country here.
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
    safeWriteJson(ACTIVE_DEALS_FILE, {
      updatedAt: new Date().toISOString(),
      deals: [],
      reports: [],
      alerts: [],
    });
  }
}

/* =====================================================
   BOOT
===================================================== */

migrateSingleStoreToCA();

// Make sure BOTH files exist on boot
ensureStore("CA");
ensureStore("US");

/* =====================================================
   STRING/URL HELPERS
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
  if (deal.sourceKey) return `source:${deal.sourceKey}`;

  if (deal.title) return `title:${normalize(deal.title)}`;

  return crypto.createHash("sha1").update(JSON.stringify(deal)).digest("hex");
}

/* =====================================================
   BACKUP (PER COUNTRY)
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

   Supported:
     writeDeals(input) -> inferred if possible, else CA
     writeDeals(country, input) -> explicit
===================================================== */

function extractDealsArray(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.deals)) return input.deals;
  return null;
}

function inferCountryFromInput(input) {
  // 1) If caller provided a top-level country
  if (input && typeof input === "object" && input.country) {
    return normalizeCountry(input.country);
  }

  const deals = extractDealsArray(input);
  if (!deals || deals.length === 0) return null;

  // 2) Infer from deal.country values
  let hasUS = false;
  let hasCA = false;

  for (const d of deals) {
    const c = String(d?.country || "").trim().toUpperCase();
    if (c === "US") hasUS = true;
    else if (c === "CA") hasCA = true;
    else hasCA = true; // missing/unknown treated as CA legacy
    if (hasUS && hasCA) break;
  }

  // If it's clearly ONLY US, treat as US.
  if (hasUS && !hasCA) return "US";

  // If mixed or only CA/legacy, do not infer.
  return null;
}

function parseWriteArgs(a, b) {
  if (typeof a === "string" && b !== undefined) {
    return { country: normalizeCountry(a), input: b, inferred: false };
  }

  const inferred = inferCountryFromInput(a);
  if (inferred === "US") {
    return { country: "US", input: a, inferred: true };
  }

  return { country: "CA", input: a, inferred: false };
}

export function writeDeals(a, b) {
  const { country, input, inferred } = parseWriteArgs(a, b);

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
    console.warn("⚠️ writeDeals blocked — attempted to overwrite non-empty store with empty deals.", {
      country: c,
      file: ACTIVE_DEALS_FILE,
    });
    return;
  }

  if (inferred) {
    console.log("🧠 writeDeals: inferred country from input ->", c);
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
===================================================== */

function parseUpsertArgs(a, b) {
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

        // 🔥 FORCE affiliate to win
        affiliateUrl: raw.affiliateUrl || current.affiliateUrl || raw.url || current.url,
        url: raw.affiliateUrl || current.affiliateUrl || raw.url || current.url,

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
   RESET (DISABLED)
===================================================== */

export function resetDeals() {
  console.warn("⚠️ resetDeals called — NOT allowed in production.");
  return { ok: false, message: "Reset disabled in production." };
}
