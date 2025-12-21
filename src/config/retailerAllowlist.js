// src/config/retailerAllowlist.js

// Keys should match what your frontend sends in the "retailer" field.
// Keep them stable and human-readable.
export const RETAILER_ALLOWLIST = {
  Amazon: ["amazon.ca", "www.amazon.ca", "a.co", "amzn.to"], // allow Amazon short links if you want
  BestBuy: ["bestbuy.ca", "www.bestbuy.ca"],
  Walmart: ["walmart.ca", "www.walmart.ca"],
  CanadianTire: ["canadiantire.ca", "www.canadiantire.ca"],
  Costco: ["costco.ca", "www.costco.ca"],
  Staples: ["staples.ca", "www.staples.ca"],
  Newegg: ["newegg.ca", "www.newegg.ca"],
};

// Common shorteners you generally do NOT want for "Other".
// Note: You can still allow some per-retailer (like amzn.to above).
export const GLOBAL_SHORTENER_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
]);

// Disallowed file extensions (direct downloads). Tune to your product.
export const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".msi", ".bat", ".cmd", ".scr", ".ps1",
  ".jar", ".apk", ".dmg", ".pkg", ".iso",
]);
