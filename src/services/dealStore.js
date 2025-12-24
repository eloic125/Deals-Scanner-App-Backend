import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE } from "../config/paths.js";

/* =====================================================
   SINGLE SOURCE OF TRUTH (NO ENV OVERRIDE)
===================================================== */

// 🔒 IMPORTANT: we DO NOT allow DEALS_FILE env override
// This prevents ghost data and split stores
const ACTIVE_DEALS_FILE = DEALS_FILE;

/* =========================
   INIT
========================= */
function ensureStore() {
  const dir = path.dirname(ACTIVE_DEALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(ACTIVE_DEALS_FILE)) {
    fs.writeFileSync(
      ACTIVE_DEALS_FILE,
      JSON.stringify({ updatedAt: null, deals: [] }, null, 2)
    );
  }
}

/* =========================
   HELPERS
========================= */
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

/**
 * Deterministic unique key
 * Priority:
 * 1. sourceKey (BEST)
 * 2. ASIN
 * 3. normalized URL
 * 4. normalized title
 */
export function getDealKey(deal) {
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

/* =========================
   READ / WRITE
========================= */
export function readDeals() {
  ensureStore();
  return JSON.parse(fs.readFileSync(ACTIVE_DEALS_FILE, "utf8"));
}

export function writeDeals(deals) {
  ensureStore();
  fs.writeFileSync(
    ACTIVE_DEALS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        deals,
      },
      null,
      2
    )
  );
}

/* =========================
   UPSERT (CANONICAL)
========================= */
export function upsertDeals(incoming = []) {
  const store = readDeals();
  const existing = store.deals || [];

  const map = new Map();

  // index existing
  for (const d of existing) {
    map.set(getDealKey(d), d);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const deal of incoming) {
    const key = getDealKey(deal);

    if (map.has(key)) {
      Object.assign(map.get(key), deal);
      updatedCount++;
    } else {
      map.set(key, deal);
      addedCount++;
    }
  }

  const merged = [...map.values()];
  writeDeals(merged);

  return {
    ok: true,
    addedCount,
    updatedCount,
    total: merged.length,
  };
}

/* =========================
   HARD RESET (OPTIONAL BUT GOLD)
========================= */
export function resetDeals() {
  writeDeals([]);
  return { ok: true, total: 0 };
}
