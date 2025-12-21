import { readDeals, writeDeals } from "../services/dealStore.js";
import { products } from "../data/products.js";

/**
 * Normalize curated product into internal deal format
 * Based strictly on src/data/products.js
 */
function normalize(product) {
  return {
    source: product.retailer?.toLowerCase() || "curated",
    title: product.title,
    price: Number(product.price),
    url: product.link,
    inStock: true
  };
}

/**
 * Run curated fetcher once
 */
function run() {
  if (!Array.isArray(products)) {
    console.error("[curatedFetcher] products is not an array");
    return;
  }

  const store = readDeals();
  const existingDeals = Array.isArray(store.deals) ? store.deals : [];

  const normalizedDeals = products.map(normalize);

  const merged = [...existingDeals, ...normalizedDeals];
  writeDeals(merged);

  console.log(
    `[curatedFetcher] inserted ${normalizedDeals.length} curated deals (total now ${merged.length})`
  );
}

run();
