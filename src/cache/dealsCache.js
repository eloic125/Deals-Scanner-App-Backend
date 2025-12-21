let cachedDeals = [];
let lastUpdated = 0;

const TTL_MS = 15 * 60 * 1000; // 15 minutes

export function getCachedDeals() {
  const isFresh = Date.now() - lastUpdated < TTL_MS;
  return isFresh ? cachedDeals : null;
}

export function setCachedDeals(deals) {
  cachedDeals = deals;
  lastUpdated = Date.now();
}

export function cacheStatus() {
  return {
    size: cachedDeals.length,
    lastUpdated,
    ttlMs: TTL_MS
  };
}
