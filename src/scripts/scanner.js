import { readDeals, writeDeals } from "../services/dealStore.js";
import { validateDeal } from "../services/dealValidator.js";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Build a legal-safe deduplication key
 * Rule: source + "|" + url
 */
function dedupKey(deal) {
  const source = deal.source || "unknown";
  const url = deal.url || "";
  return `${source}|${url}`;
}

/**
 * Run one validation + deduplication pass
 */
function runOnce() {
  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const before = deals.length;

  // 1) Validate first
  const validDeals = [];
  for (const deal of deals) {
    const result = validateDeal(deal);
    if (result.isValid) {
      validDeals.push(deal);
    }
  }

  // 2) Deduplicate by source|url, keep best (lowest) price
  const bestByKey = new Map();

  for (const deal of validDeals) {
    const key = dedupKey(deal);
    const price = Number(deal.price);

    if (!bestByKey.has(key)) {
      bestByKey.set(key, deal);
      continue;
    }

    const existing = bestByKey.get(key);
    const existingPrice = Number(existing.price);

    // Keep the lowest valid price
    if (
      Number.isFinite(price) &&
      price > 0 &&
      (!Number.isFinite(existingPrice) || price < existingPrice)
    ) {
      bestByKey.set(key, deal);
    }
  }

  const dedupedDeals = Array.from(bestByKey.values());

  writeDeals(dedupedDeals);

  console.log(
    `[scanner] ${new Date().toISOString()} | ${before} -> ${dedupedDeals.length} after dedup`
  );
}

/**
 * Start scanner loop
 */
function start() {
  console.log(`[scanner] started at ${new Date().toISOString()}`);
  runOnce();
  setInterval(runOnce, INTERVAL_MS);
}

start();
