import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DEALS_FILE as DEFAULT_DEALS_FILE } from "../config/paths.js";

/* =========================
   CONFIG
========================= */

const ACTIVE_DEALS_FILE =
  process.env.DEALS_FILE?.trim() || DEFAULT_DEALS_FILE;

/* =========================
   INIT
========================= */

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
      ),
      "utf8"
    );
  }
}

/* =========================
   HELPERS
========================= */

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeUrl(url) {
  if (!url) return null;
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
 * Canonical dedup key
 */
export function getDealKey(deal) {
  if (deal.sourceKey) return `source:${deal.sourceKey}`;
  if (deal.asin) return `asin:${deal.asin}`;

  const url = normalizeUrl(deal.url);
  if (url) return `url:${url}`;

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
    ),
    "utf8"
  );
}

/* =========================
   UPSERT (ADMIN BULK)
========================= */

export function upsertDeals(incomingDeals = []) {
  const store = readDeals();
  const existing = Array.isArray(store.deals) ? store.deals : [];

  const index = new Map();

  for (const d of existing) {
    index.set(getDealKey(d), d);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const deal of incomingDeals) {
    const key = getDealKey(deal);

    if (index.has(key)) {
      Object.assign(index.get(key), deal, {
        updatedAt: new Date().toISOString(),
      });
      updatedCount++;
    } else {
      index.set(key, {
        ...deal,
        id: deal.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      addedCount++;
    }
  }

  const merged = Array.from(index.values());
  writeDeals(merged);

  return {
    addedCount,
    updatedCount,
    total: merged.length,
  };
}
