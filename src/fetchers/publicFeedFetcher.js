import { readDeals, writeDeals } from "../services/dealStore.js";

/**
 * Example public JSON feed (read-only)
 * Replace with any other public feed later without changing the pipeline.
 */
const FEED_URL = "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md"; 
// NOTE: This is a placeholder URL for structure safety.
// We'll parse mock items below to keep execution deterministic.

/**
 * Normalize raw feed item into internal deal shape
 */
function normalize(item) {
  return {
    source: "public-feed",
    title: item.title,
    price: item.price,
    url: item.url,
    inStock: item.inStock !== false
  };
}

/**
 * Fetch public feed
 * For safety + determinism, we simulate parsed items here.
 * Swap this with real feed parsing when ready.
 */
async function fetchPublicDeals() {
  // Simulated parsed feed items (legal-safe, deterministic)
  return [
    {
      title: "Public Feed USB-C Charger",
      price: 24.99,
      url: "https://example.com/public/usb-c-charger",
      inStock: true
    },
    {
      title: "Public Feed SSD 1TB",
      price: 89.99,
      url: "https://example.com/public/ssd-1tb",
      inStock: true
    }
  ];
}

/**
 * Run fetcher once
 */
async function run() {
  const store = readDeals();
  const existing = Array.isArray(store.deals) ? store.deals : [];

  const rawItems = await fetchPublicDeals();
  const normalized = rawItems.map(normalize);

  const merged = [...existing, ...normalized];
  writeDeals(merged);

  console.log(
    `[publicFeedFetcher] inserted ${normalized.length} deals (total now ${merged.length})`
  );
}

run().catch(err => {
  console.error("[publicFeedFetcher] error", err);
});
