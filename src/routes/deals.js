import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";

const router = express.Router();

/* =========================
   ADMIN AUTH
========================= */

const ADMIN_KEY = process.env.ADMIN_KEY?.trim();

if (!ADMIN_KEY) {
  console.error("ADMIN_KEY is missing");
  process.exit(1);
}

function requireAdmin(req, res) {
  const key = String(req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_KEY) {
    res.status(403).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/* =========================
   AMAZON URL NORMALIZER
   ✨ NEW VERSION
   - Keeps marketplace region (.ca, .com, .co.uk, etc.)
   - Canonical: https://www.amazon.xx/dp/<ASIN>?tag=...
========================= */

function normalizeAmazonUrl(inputUrl) {
  try {
    const url = String(inputUrl || "").trim();
    if (!url) return null;

    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();

    // Not Amazon? return as-is (just cleaned)
    if (!host.includes("amazon.")) {
      u.hash = "";
      return u.toString();
    }

    // Extract ASIN
    const match =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);

    const asin = match?.[1]?.toUpperCase();

    // If no ASIN → return cleaned link instead of breaking
    if (!asin) {
      u.hash = "";
      return u.toString();
    }

    // Preserve marketplace
    let marketplace = host;

    if (host.includes("amazon.ca")) marketplace = "www.amazon.ca";
    else if (host.includes("amazon.com")) marketplace = "www.amazon.com";
    else if (host.includes("amazon.co.uk")) marketplace = "www.amazon.co.uk";
    else marketplace = host;

    // Keep affiliate tag
    const tag = u.searchParams.get("tag");

    const out = new URL(`https://${marketplace}/dp/${asin}`);
    if (tag) out.searchParams.set("tag", tag);

    return out.toString();
  } catch {
    return null;
  }
}

/* =========================
   GET DEALS (PUBLIC)
========================= */

router.get("/deals", (req, res) => {
  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const now = Date.now();

  const visibleDeals = deals.filter(d => {
    if (d.status !== "approved") return false;
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= now) return false;
    return true;
  });

  res.json({
    updatedAt: store.updatedAt || new Date().toISOString(),
    count: visibleDeals.length,
    deals: visibleDeals,
  });
});

/* =========================
   CREATE DEAL (ADMIN)
========================= */

router.post("/admin/deals", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const input = req.body || {};

  if (!input.title || typeof input.price !== "number") {
    return res
      .status(400)
      .json({ error: "Missing required fields: title, price(number)" });
  }

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const now = new Date().toISOString();

  const url = input.url ? normalizeAmazonUrl(input.url) : null;

  const deal = {
    id: crypto.randomUUID(),
    title: String(input.title).trim(),
    price: input.price,
    originalPrice:
      typeof input.originalPrice === "number" ? input.originalPrice : null,
    retailer: typeof input.retailer === "string" ? input.retailer : "Amazon",
    category: typeof input.category === "string" ? input.category : "General",
    imageUrl: typeof input.imageUrl === "string" ? input.imageUrl : null,
    notes: typeof input.notes === "string" ? input.notes : null,
    url,

    status: "approved",
    expiresAt: null,

    createdAt: now,
    updatedAt: now,
  };

  deals.unshift(deal);

  writeDeals(deals);

  res.status(201).json({ ok: true, deal });
});

/* =========================
   UPDATE DEAL (ADMIN)
========================= */

router.put("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const updates = req.body || {};

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const now = new Date().toISOString();

  const next = {
    ...deals[idx],
    ...updates,
    updatedAt: now,
  };

  if (typeof updates.url === "string") {
    next.url = normalizeAmazonUrl(updates.url);
  }

  deals[idx] = next;

  writeDeals(deals);

  res.json({ ok: true, deal: next });
});

/* =========================
   DELETE DEAL (ADMIN)
========================= */

router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const now = new Date().toISOString();

  deals[idx] = {
    ...deals[idx],
    status: "disabled",
    expiresAt: now,
    updatedAt: now,
  };

  writeDeals(deals);

  res.json({ ok: true, disabledId: id });
});

/* =========================
   BASE44 COMPAT DELETE
========================= */

router.post("/admin/deals/:id/delete", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const now = new Date().toISOString();

  deals[idx] = {
    ...deals[idx],
    status: "disabled",
    expiresAt: now,
    updatedAt: now,
  };

  writeDeals(deals);

  res.json({ ok: true, disabledId: id });
});

export default router;
