import fs from "fs";
import { DATA_DIR, DEALS_FILE } from "../config/paths.js";

/**
 * Ensure data directory and deals.json exist
 */
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DEALS_FILE)) {
    const initial = {
      updatedAt: new Date().toISOString(),
      deals: []
    };
    fs.writeFileSync(DEALS_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

/**
 * Read deals.json
 */
export function readDeals() {
  ensureStore();
  const raw = fs.readFileSync(DEALS_FILE, "utf8");
  return JSON.parse(raw);
}

/**
 * Write deals.json
 */
export function writeDeals(deals) {
  ensureStore();
  const payload = {
    updatedAt: new Date().toISOString(),
    deals
  };
  fs.writeFileSync(DEALS_FILE, JSON.stringify(payload, null, 2), "utf8");
}
