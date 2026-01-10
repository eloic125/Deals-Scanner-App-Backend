/**
 * =====================================================
 * DEALS ROUTES — FIX: DEALS NOT SHOWING (CA/US MERGE)
 * =====================================================
 *
 * WHAT WAS BROKEN:
 * - Your PUBLIC /deals endpoint always does:
 *     const normalizedCountry = normalizeCountry(country);
 *   If country is missing/undefined (common on homepage / default views),
 *   normalizeCountry(undefined) => "CA"
 *   So you were ONLY reading CA store and NEVER loading US deals.
 *
 * FIX (SAFE, NO REMOVALS):
 * - If ?country=CA  -> readDeals("CA") only
 * - If ?country=US  -> readDeals("US") only
 * - If country missing -> MERGE readDeals("CA") + readDeals("US")
 *
 * ALSO FIXED:
 * - PUBLIC /deals/:id now searches both stores if country is missing,
 *   so clicking a US deal link still works from mixed feeds.
 *
 * EVERYTHING ELSE:
 * - All routes below are preserved exactly (admin/user/report/alerts/etc.)
 * - No schema changes required
 * - Ingest script can keep writing country "CA"/"US" normally
 * =====================================================
 */

import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { classifyDealCategory } from "../services/classifyDealCategory.js";
import { addUserPoints } from "../services/userStore.js";

const router = express.Router();

/* =========================
   ADMIN AUTH
========================= */

const ADMIN_KEY = process.env.ADMIN_KEY?.trim();

if (!ADMIN_KEY) {
  console.error("ADMIN_KEY missing — backend cannot run.");
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
   HELPERS
========================= */

function normalizeCountry(input) {
  return String(input || "").toUpperCase() === "US" ? "US" : "CA";
}

/**
 * NEW (SAFE): Return one or two stores depending on whether country is provided.
 * - country="CA" => [CA store]
 * - country="US" => [US store]
 * - missing/other => [CA store, US store]
 */
function getStoresForCountryParam(countryParam) {
  const c = String(countryParam || "").trim().toUpperCase();
  if (c === "CA") return [readDeals("CA")];
  if (c === "US") return [readDeals("US")];
  return [readDeals("CA"), readDeals("US")];
}

function normalizeAmazonUrl(inputUrl) {
  try {
    const url = String(inputUrl || "").trim();
    if (!url) return null;

    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();

    if (!host.includes("amazon.")) {
      u.hash = "";
      return u.toString();
    }

    const match =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);

    const asin = match?.[1]?.toUpperCase();
    if (!asin) return u.toString();

    let marketplace = "www.amazon.com";
    if (host.includes("amazon.ca")) marketplace = "www.amazon.ca";
    if (host.includes("amazon.co.uk")) marketplace = "www.amazon.co.uk";

    const tag = u.searchParams.get("tag");

    const out = new URL(`https://${marketplace}/dp/${asin}`);
    if (tag) out.searchParams.set("tag", tag);

    return out.toString();
  } catch {
    return null;
  }
}

function ensureReports(store) {
  if (!Array.isArray(store.reports)) store.reports = [];
  return store;
}

function ensureAlerts(store) {
  if (!Array.isArray(store.alerts)) store.alerts = [];
  return store;
}

/* =========================
   PUBLIC — LIST DEALS
========================= */

router.get("/deals", (req, res) => {
  const { category, sort, maxPrice, discount, country } = req.query;

  // FIX: do NOT default to CA when country is missing.
  // If country is missing => merge CA + US
  const stores = getStoresForCountryParam(country);

  // Merge deals from one or both stores
  let deals = [];
  let updatedAt = null;

  for (const store of stores) {
    if (!updatedAt && store?.updatedAt) updatedAt = store.updatedAt;
    if (Array.isArray(store?.deals)) deals.push(...store.deals);
  }

  const now = Date.now();

  deals = deals.filter((d) => {
    if (d.status !== "approved") return false;
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= now) return false;
    return true;
  });

  if (category && category !== "All") {
    deals = deals.filter(
      (d) =>
        String(d.category || "").toLowerCase() ===
        String(category).toLowerCase()
    );
  }

  if (maxPrice) {
    deals = deals.filter((d) => Number(d.price) <= Number(maxPrice));
  }

  if (discount) {
    const min = Number(discount);
    deals = deals.filter((d) => {
      const p = Number(d.price);
      const op = Number(d.originalPrice);
      if (!op || !p || op <= 0) return false;
      const percent = Math.round(((op - p) / op) * 100);
      return percent >= min;
    });
  }

  if (sort === "newest") {
    deals = deals.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }

  if (sort === "trending") {
    deals = deals.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  }

  res.json({
    updatedAt: updatedAt || new Date().toISOString(),
    count: deals.length,
    deals,
  });
});

/* =========================
   PUBLIC — DEAL DETAILS (COUNTRY SAFE)
========================= */

router.get("/deals/:id", (req, res) => {
  // FIX: If country is missing, search BOTH stores so links work from merged feeds.
  const stores = getStoresForCountryParam(req.query.country);

  for (const store of stores) {
    const deal = (store.deals || []).find((d) => d.id === req.params.id);
    if (deal) return res.json(deal);
  }

  return res.json({
    missing: true,
    message: "Deal not found (maybe deleted)",
  });
});

/* =========================
   USER — SUBMIT DEAL
========================= */

router.post("/deals", async (req, res) => {
  const body = req.body || {};
  const normalizedCountry = normalizeCountry(body.country);
  const store = readDeals(normalizedCountry);
  const now = new Date().toISOString();

  if (!body.title || typeof body.price !== "number") {
    return res.status(400).json({ error: "title and price are required" });
  }

  let category = "Other";
  try {
    category = await classifyDealCategory({
      title: body.title,
      description: body.notes || body.description || "",
    });
  } catch {}

  const isAdmin =
    String(req.headers["x-admin-key"] || "").trim() === ADMIN_KEY;

  const deal = {
    id: crypto.randomUUID(),
    title: String(body.title),
    price: Number(body.price),
    originalPrice: body.originalPrice ? Number(body.originalPrice) : null,
    retailer: body.retailer || "Amazon",
    category,
    imageUrl: body.imageUrl || null,
    notes: body.notes || null,
    url: normalizeAmazonUrl(body.url),
    status: isAdmin ? "approved" : "pending",
    country: normalizedCountry,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    clicks: 0,
    createdByUserId: req.user?.id || null,
    pointsAwarded: false,
    pointsAwardedAt: null,
  };

  store.deals.unshift(deal);
  writeDeals(normalizedCountry, store);

  res.status(201).json({ ok: true, pending: !isAdmin, deal });
});

/* =========================
   USER — REPORT DEAL
========================= */

router.post("/deals/:id/report", (req, res) => {
  const normalizedCountry = normalizeCountry(req.body?.country);
  const store = ensureReports(readDeals(normalizedCountry));

  const deal = store.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  if (!req.body?.reason)
    return res.status(400).json({ error: "reason is required" });

  store.reports.push({
    id: crypto.randomUUID(),
    dealId: deal.id,
    reason: String(req.body.reason),
    notes: req.body.notes ? String(req.body.notes) : null,
    userId: req.user?.id || null,
    status: "pending",
    user_seen: false,
    createdAt: new Date().toISOString(),
  });

  writeDeals(normalizedCountry, store);
  res.json({ ok: true });
});

/* =========================
   ADMIN — CREATE
========================= */

router.post("/admin/deals", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const normalizedCountry = normalizeCountry(body.country);
  const store = readDeals(normalizedCountry);
  const now = new Date().toISOString();

  if (!body.title || typeof body.price !== "number") {
    return res.status(400).json({ error: "title and price required" });
  }

  let category = "Other";
  try {
    category = await classifyDealCategory({
      title: body.title,
      description: body.notes || "",
    });
  } catch {}

  const deal = {
    id: crypto.randomUUID(),
    title: String(body.title),
    price: Number(body.price),
    originalPrice: body.originalPrice ? Number(body.originalPrice) : null,
    retailer: body.retailer || "Amazon",
    category,
    imageUrl: body.imageUrl || null,
    notes: body.notes || null,
    url: normalizeAmazonUrl(body.url),
    status: "approved",
    country: normalizedCountry,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    clicks: 0,
    createdByUserId: null,
    pointsAwarded: false,
    pointsAwardedAt: null,
  };

  store.deals.unshift(deal);
  writeDeals(normalizedCountry, store);

  res.status(201).json({ ok: true, deal });
});

/* =========================
   ADMIN — PENDING
========================= */

router.get("/admin/deals/pending", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const normalizedCountry = normalizeCountry(req.query.country);
  const store = readDeals(normalizedCountry);

  res.json({
    ok: true,
    deals: store.deals.filter((d) => d.status === "pending"),
  });
});

/* =========================
   ADMIN — APPROVE / REJECT / UPDATE / DELETE
========================= */

router.post("/admin/deals/:id/approve", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const normalizedCountry = normalizeCountry(req.body?.country);
  const store = readDeals(normalizedCountry);

  const deal = store.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "approved";
  deal.updatedAt = new Date().toISOString();

  const POINTS = 25;
  if (deal.createdByUserId && !deal.pointsAwarded) {
    const r = addUserPoints(deal.createdByUserId, POINTS);
    if (r?.ok) {
      deal.pointsAwarded = true;
      deal.pointsAwardedAt = new Date().toISOString();
      deal.pointsAwardedAmount = POINTS;
    }
  }

  writeDeals(normalizedCountry, store);
  res.json({ ok: true, deal });
});

router.post("/admin/deals/:id/reject", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const normalizedCountry = normalizeCountry(req.body?.country);
  const store = readDeals(normalizedCountry);

  const deal = store.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "rejected";
  deal.updatedAt = new Date().toISOString();

  writeDeals(normalizedCountry, store);
  res.json({ ok: true, deal });
});

router.put("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const normalizedCountry = normalizeCountry(req.body?.country);
  const store = ensureAlerts(readDeals(normalizedCountry));

  const idx = store.deals.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const existing = store.deals[idx];
  const oldPrice = Number(existing.price);

  const next = {
    ...existing,
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  if (req.body.url) next.url = normalizeAmazonUrl(req.body.url);

  const newPrice = Number(next.price);
  if (
    Number.isFinite(oldPrice) &&
    Number.isFinite(newPrice) &&
    newPrice !== oldPrice
  ) {
    const now = new Date().toISOString();
    store.alerts = store.alerts.map((a) =>
      a &&
      !a.triggeredAt &&
      a.dealId === next.id &&
      typeof a.targetPrice === "number" &&
      newPrice <= a.targetPrice
        ? { ...a, triggeredAt: now, active: false }
        : a
    );
  }

  store.deals[idx] = next;
  writeDeals(normalizedCountry, store);

  res.json({ ok: true, deal: next });
});

router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const normalizedCountry = normalizeCountry(req.body?.country);
  const store = readDeals(normalizedCountry);

  const deal = store.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "disabled";
  deal.expiresAt = new Date().toISOString();
  deal.updatedAt = new Date().toISOString();

  writeDeals(normalizedCountry, store);
  res.json({ ok: true });
});

export default router;
