import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { DEALS_FILE as DEFAULT_DEALS_FILE } from "../config/paths.js";

const ACTIVE_DEALS_FILE =
  process.env.DEALS_FILE?.trim() || DEFAULT_DEALS_FILE;

/* =========================
   INIT
========================= */
function ensureStore() {
  const dir = path.dirname(ACTIVE_DEALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(ACTIVE_DEALS_FILE)) {
    fs.writeFileSync(
      ACTIVE_DEALS_FILE,
      JSON.stringify({ updatedAt: new Date().toISOString(), deals: [] }, null, 2)
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

export function getDealKey(deal) {
  if (deal.sourceKey) return `source:${deal.sourceKey}`;
  if (deal.asin) return `asin:${deal.asin}`;
  const u = normalizeUrl(deal.url);
  if (u) return `url:${u}`;
  if (deal.title) return `title:${normalize(deal.title)}`;
  return crypto.createHash("sha1").update(JSON.stringify(deal)).digest("hex");
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
    JSON.stringify({ updatedAt: new Date().toISOString(), deals }, null, 2)
  );
}

/* =========================
   UPSERT (THIS WAS MISSING)
========================= */
export function upsertDeals(incoming = []) {
  const store = readDeals();
  const existing = store.deals || [];

  const map = new Map();
  for (const d of existing) map.set(getDealKey(d), d);

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

  return { addedCount, updatedCount, total: merged.length };
}
