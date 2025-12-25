import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE } from "../config/paths.js";

/* =====================================================
   ACTIVE DATA FILE
===================================================== */

const ACTIVE_DEALS_FILE = DEALS_FILE;

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
        },
        null,
        2
      )
    );
  }
}

/* =====================================================
   NORMALIZATION
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
    };
  } catch (err) {
    console.error("readDeals failed:", err);
    return { updatedAt: new Date().toISOString(), deals: [] };
  }
}

/* =====================================================
   WRITE
===================================================== */

export function writeDeals(dealsArray) {
  ensureStore();

  if (!Array.isArray(dealsArray)) {
    throw new Error("writeDeals expects an array");
  }

  fs.writeFileSync(
    ACTIVE_DEALS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        deals: dealsArray,
      },
      null,
      2
    )
  );
}

/* =====================================================
   UPSERT (CREATES OR UPDATES)
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
        id: current.id, // preserve ID
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

  writeDeals(merged);

  return {
    ok: true,
    addedCount,
    updatedCount,
    total: merged.length,
  };
}

/* =====================================================
   RESET STORE (ADMIN)
===================================================== */

export function resetDeals() {
  writeDeals([]);
  return { ok: true, total: 0 };
}
