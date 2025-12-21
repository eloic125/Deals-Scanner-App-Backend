import { readDeals, writeDeals } from "../services/dealStore.js";

/**
 * Internal mock fetcher
 * This simulates an external data source
 */
function fetchMockDeals() {
  return [
    {
      source: "mock",
      title: "Mock Gaming Mouse",
      price: 39.99,
      url: "https://example.com/mock-gaming-mouse",
      inStock: true
    },
    {
      source: "mock",
      title: "Mock Mechanical Keyboard",
      price: 129.99,
      url: "https://example.com/mock-keyboard",
      inStock: true
    },
    {
      source: "mock",
      title: "Mock Headset (Out of Stock)",
      price: 89.99,
      url: "https://example.com/mock-headset",
      inStock: false
    }
  ];
}

/**
 * Run fetcher once
 */
function run() {
  const store = readDeals();
  const existingDeals = Array.isArray(store.deals) ? store.deals : [];

  const newDeals = fetchMockDeals();

  const merged = [...existingDeals, ...newDeals];

  writeDeals(merged);

  console.log(
    `[mockFetcher] inserted ${newDeals.length} deals (total now ${merged.length})`
  );
}

run();
