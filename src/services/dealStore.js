import fs from "fs";
import path from "path";
import { DATA_DIR, DEALS_FILE as DEFAULT_DEALS_FILE } from "../config/paths.js";

// Render disk path (if provided), otherwise local default
const ACTIVE_DEALS_FILE = process.env.DEALS_FILE?.trim() || DEFAULT_DEALS_FILE;

// Ensure data directory and deals.json exist
function ensureStore() {
  const dir = path.dirname(ACTIVE_DEALS_FILE);

  // Make sure the parent directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create file if missing
  if (!fs.existsSync(ACTIVE_DEALS_FILE)) {
    const initial = {
      updatedAt: new Date().toISOString(),
      deals: [],
    };
    fs.writeFileSync(ACTIVE_DEALS_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

/**
 * Read deals.json
 */
export function readDeals() {
  ensureStore();
  const raw = fs.readFileSync(ACTIVE_DEALS_FILE, "utf8");
  return JSON.parse(raw);
}

/**
 * Write deals.json
 */
export function writeDeals(deals) {
  ensureStore();
  const payload = {
    updatedAt: new Date().toISOString(),
    deals,
  };
  fs.writeFileSync(ACTIVE_DEALS_FILE, JSON.stringify(payload, null, 2), "utf8");
}
