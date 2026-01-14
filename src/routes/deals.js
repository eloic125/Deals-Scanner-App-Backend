/**
 * =====================================================
 * DEALS ROUTES — STRICT COUNTRY FILTER (NO MERGE)
 * =====================================================
 *
 * FINAL BEHAVIOR:
 * - country=CA  -> READ/WRITE CA FILE ONLY
 * - country=US  -> READ/WRITE US FILE ONLY
 * - missing     -> DEFAULT CA
 *
 * RULES:
 * - PUBLIC reads NEVER merge
 * - ADMIN reads/writes ALWAYS country-specific
 * - DELETE = soft delete (status=disabled + expiresAt)
 * - Compatible with country-split dealStore.js
 *
 * FIXES APPLIED (CRITICAL):
 * 1) USER SUBMIT ALWAYS PENDING:
 *    - Public POST /deals must NEVER auto-approve based on x-admin-key.
 *    - Prevents "pending page empty" even when frontend accidentally sends x-admin-key.
 *
 * 2) ADMIN PENDING:
 *    - GET /admin/deals/pending returns ONLY status === "pending"
 *
 * 3) ADMIN APPROVE:
 *    - Approve sets status="approved" and awards points once (if createdByUserId exists)
 *
 * 4) ADMIN REJECT:
 *    - Reject removes the deal from store entirely (so it never "comes back")
 *      (This matches your requirement: "reject deletes pending deal".)
 *
 * 5) STRICT COUNTRY RESOLUTION:
 *    - query.country -> header x-country -> body.country -> default CA
 *    - Works for GET/POST/PUT/DELETE (body may be missing on DELETE)
 *
 * 6) PUBLIC LIST:
 *    - returns only approved + not expired
 *
 * NOTE:
 * - This file intentionally includes admin endpoints as you pasted them here.
 * - If you also have a separate routes/admin.js, do NOT duplicate endpoints across files.
 *   Use ONE source of truth. (But you asked full edited script here, so it’s all included.)
 *
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
   COUNTRY (SINGLE SOURCE)
========================= */

function normalizeCountry(v) {
  return String(v || "")
    .trim()
    .toUpperCase() === "US"
    ? "US"
    : "CA";
}

/**
 * Resolve country from request in a robust way.
 * Priority is designed to work with:
 * - GET (query usually present OR header used by app)
 * - POST/PUT (body sometimes present)
 * - DELETE (body often missing)
 */
function resolveCountry(req, { allowBody = true } = {}) {
  if (req.query?.country) return normalizeCountry(req.query.country);
  if (req.headers?.["x-country"]) return normalizeCountry(req.headers["x-country"]);
  if (allowBody && req.body?.country) return normalizeCountry(req.body.country);
  return "CA";
}

/**
 * PUBLIC READ COUNTRY
 * - Strict single country
 * - Uses query first, but supports header fallback for app/webview
 */
function publicReadCountry(req) {
  return resolveCountry(req, { allowBody: false });
}

/**
 * PUBLIC WRITE COUNTRY
 * - For POST/report/click where body may or may not include country
 */
function publicWriteCountry(req) {
  return resolveCountry(req, { allowBody: true });
}

/**
 * ADMIN COUNTRY
 * - Must work for DELETE (no body)
 */
function adminCountry(req) {
  return resolveCountry(req, { allowBody: true });
}

/* =========================
   BASIC HELPERS
========================= */

function nowIso() {
  return new Date().toISOString();
}

function str(v) {
  return String(v || "").trim();
}

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isExpired(deal, nowMs) {
  if (!deal?.expiresAt) return false;
  const t = new Date(deal.expiresAt).getTime();
  return Number.isFinite(t) ? t <= nowMs : false;
}

function isApproved(deal) {
  return String(deal?.status || "").trim() === "approved";
}

function ensureStore(store) {
  const s = store && typeof store === "object" ? store : {};
  if (!Array.isArray(s.deals)) s.deals = [];
  if (!Array.isArray(s.reports)) s.reports = [];
  if (!Array.isArray(s.alerts)) s.alerts = [];
  if (!s.updatedAt) s.updatedAt = nowIso();
  return s;
}

function ensureReports(store) {
  const s = ensureStore(store);
  if (!Array.isArray(s.reports)) s.reports = [];
  return s;
}

function ensureAlerts(store) {
  const s = ensureStore(store);
  if (!Array.isArray(s.alerts)) s.alerts = [];
  return s;
}

/* =========================
   URL NORMALIZATION
========================= */

function normalizeAmazonUrl(inputUrl) {
  try {
    const url = String(inputUrl || "").trim();
    if (!url) return null;

    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();

    // Non-amazon: strip tracking
    if (!host.includes("amazon.")) {
      u.search = "";
      u.hash = "";
      return u.toString();
    }

    const match =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);

    const asin = match?.[1]?.toUpperCase();
    if (!asin) return u.toString();

    const marketplace = host.includes("amazon.ca") ? "www.amazon.ca" : "www.amazon.com";
    const tag = u.searchParams.get("tag");

    const out = new URL(`https://${marketplace}/dp/${asin}`);
    if (tag) out.searchParams.set("tag", tag);

    return out.toString();
  } catch {
    return null;
  }
}

/* =========================
   FIND DEAL (ID ONLY)
   (STRICT, predictable)
========================= */

function findDealById(store, id) {
  const deals = Array.isArray(store?.deals) ? store.deals : [];
  return (
    deals.find(
      (d) => String(d?.id || "").trim() === String(id || "").trim()
    ) || null
  );
}

function findDealIndexById(store, id) {
  const deals = Array.isArray(store?.deals) ? store.deals : [];
  return deals.findIndex(
    (d) => String(d?.id || "").trim() === String(id || "").trim()
  );
}

/* =========================
   PUBLIC — LIST DEALS
========================= */

router.get("/deals", (req, res) => {
  const { category, sort, maxPrice, discount } = req.query;

  const country = publicReadCountry(req);
  const store = ensureStore(readDeals(country));
  const nowMs = Date.now();

  let deals = Array.isArray(store.deals) ? [...store.deals] : [];

  // PUBLIC shows approved + not expired only
  deals = deals.filter((d) => {
    if (!isApproved(d)) return false;
    if (isExpired(d, nowMs)) return false;
    return true;
  });

  // Category filter
  if (category && String(category) !== "All") {
    const want = lower(category);
    deals = deals.filter((d) => lower(d?.category) === want);
  }

  // Max price filter
  if (maxPrice !== undefined && maxPrice !== null && String(maxPrice).trim() !== "") {
    const mp = Number(maxPrice);
    if (Number.isFinite(mp)) {
      deals = deals.filter((d) => Number(d.price) <= mp);
    }
  }

  // Discount filter
  if (discount !== undefined && discount !== null && String(discount).trim() !== "") {
    const min = Number(discount);
    if (Number.isFinite(min)) {
      deals = deals.filter((d) => {
        const p = Number(d.price);
        const op = Number(d.originalPrice);
        if (!op || !p || op <= 0) return false;
        return Math.round(((op - p) / op) * 100) >= min;
      });
    }
  }

  // Sorting
  if (sort === "newest") {
    deals.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (sort === "trending") {
    deals.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  }

  res.json({
    country,
    updatedAt: store.updatedAt || nowIso(),
    count: deals.length,
    deals,
  });
});

/* =========================
   PUBLIC — DEAL DETAILS
========================= */

router.get("/deals/:id", (req, res) => {
  const country = publicReadCountry(req);
  const store = ensureStore(readDeals(country));
  const deal = findDealById(store, req.params.id);

  if (!deal) return res.status(404).json({ error: "Deal not found" });

  // Public-only constraints
  const nowMs = Date.now();
  if (!isApproved(deal)) return res.status(404).json({ error: "Deal not found" });
  if (isExpired(deal, nowMs)) return res.status(404).json({ error: "Deal not found" });

  res.json(deal);
});

/* =========================
   PUBLIC — CLICK TRACKING
========================= */

router.post("/deals/:id/click", (req, res) => {
  // IMPORTANT: click requests often have no body; use header/query too.
  const country = publicWriteCountry(req);
  const store = ensureStore(readDeals(country));

  const deal = findDealById(store, req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  // Only count clicks on active approved deals
  const nowMs = Date.now();
  if (!isApproved(deal) || isExpired(deal, nowMs)) {
    return res.status(400).json({ error: "Deal not active" });
  }

  deal.clicks = toNumOrZero(deal.clicks) + 1;
  deal.updatedAt = nowIso();

  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, id: deal.id, clicks: deal.clicks });
});

/* =========================
   USER — SUBMIT DEAL
   FIX: ALWAYS PENDING
========================= */

router.post("/deals", async (req, res) => {
  const body = req.body || {};
  const country = publicWriteCountry(req);
  const store = ensureStore(readDeals(country));
  const ts = nowIso();

  const title = str(body.title);
  const price = toNumOrNull(body.price);

  if (!title) return res.status(400).json({ error: "title and price are required" });
  if (!Number.isFinite(price)) return res.status(400).json({ error: "title and price are required" });

  const url = normalizeAmazonUrl(body.url) || str(body.url) || null;
  if (!url) return res.status(400).json({ error: "url is required" });

  let category = str(body.category) || "Other";
  try {
    if (!body.category) {
      category =
        (await classifyDealCategory({
          title,
          description: str(body.notes || body.description || ""),
        })) || "Other";
      category = str(category) || "Other";
    }
  } catch {}

  // ✅ CRITICAL FIX:
  // Public submissions MUST always be pending.
  // Never auto-approve based on x-admin-key (frontend may accidentally send it).
  const deal = {
    id: crypto.randomUUID(),
    title,
    price: Number(price),
    originalPrice: toNumOrNull(body.originalPrice),
    retailer: str(body.retailer) || "Amazon",
    category,
    imageUrl: str(body.imageUrl) || null,
    notes: str(body.notes) || null,
    url,
    status: "pending", // ✅ ALWAYS pending
    country,
    createdAt: ts,
    updatedAt: ts,
    expiresAt: null,
    clicks: 0,
    createdByUserId: req.user?.id || null,
    pointsAwarded: false,
    pointsAwardedAt: null,
    pointsAwardedAmount: null,
  };

  store.deals.unshift(deal);
  store.updatedAt = ts;
  writeDeals(country, store);

  res.status(201).json({ ok: true, pending: true, country, deal });
});

/* =========================
   USER — REPORT DEAL
========================= */

router.post("/deals/:id/report", (req, res) => {
  // IMPORTANT: report must work with header/query when body.country missing.
  const country = publicWriteCountry(req);
  const store = ensureReports(readDeals(country));

  const deal = findDealById(store, req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  const reason = str(req.body?.reason);
  if (!reason) return res.status(400).json({ error: "reason is required" });

  const report = {
    id: crypto.randomUUID(),
    deal_id: deal.id,
    dealId: deal.id,
    reason,
    notes: req.body?.notes ? String(req.body.notes) : null,
    userId: req.user?.id || null,
    status: "pending",
    user_seen: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  store.reports.unshift(report);
  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, report });
});

/* =========================
   ADMIN — LIST (STRICT)
   GET /admin/deals?country=US|CA
========================= */

router.get("/admin/deals", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureStore(readDeals(country));

  res.json({
    country,
    updatedAt: store.updatedAt || nowIso(),
    deals: Array.isArray(store.deals) ? store.deals : [],
    reports: Array.isArray(store.reports) ? store.reports : [],
    alerts: Array.isArray(store.alerts) ? store.alerts : [],
  });
});

/* =========================
   ADMIN — PENDING DEALS
   GET /admin/deals/pending
========================= */

router.get("/admin/deals/pending", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureStore(readDeals(country));

  const pendingDeals = store.deals.filter(
    (d) => String(d.status || "").trim() === "pending"
  );

  res.json({
    country,
    count: pendingDeals.length,
    deals: pendingDeals,
  });
});

/* =========================
   ADMIN — CREATE
   POST /admin/deals
========================= */

router.post("/admin/deals", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const country = normalizeCountry(body.country);
  const store = ensureStore(readDeals(country));
  const ts = nowIso();

  const title = str(body.title);
  const price = toNumOrNull(body.price);

  if (!title || !Number.isFinite(price)) {
    return res.status(400).json({ error: "title and price required" });
  }

  const url = normalizeAmazonUrl(body.url) || str(body.url) || null;
  if (!url) return res.status(400).json({ error: "url is required" });

  let category = str(body.category) || "Other";
  try {
    if (!body.category) {
      category =
        (await classifyDealCategory({
          title,
          description: str(body.notes || ""),
        })) || "Other";
      category = str(category) || "Other";
    }
  } catch {}

  const deal = {
    id: crypto.randomUUID(),
    title,
    price: Number(price),
    originalPrice: toNumOrNull(body.originalPrice),
    retailer: str(body.retailer) || "Amazon",
    category,
    imageUrl: str(body.imageUrl) || null,
    notes: str(body.notes) || null,
    url,
    status: "approved",
    country,
    createdAt: ts,
    updatedAt: ts,
    expiresAt: null,
    clicks: 0,
    createdByUserId: null,
    pointsAwarded: false,
    pointsAwardedAt: null,
    pointsAwardedAmount: null,
  };

  store.deals.unshift(deal);
  store.updatedAt = ts;
  writeDeals(country, store);

  res.status(201).json({ ok: true, country, deal });
});

/* =========================
   ADMIN — APPROVE
   POST /admin/deals/:id/approve
========================= */

router.post("/admin/deals/:id/approve", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureStore(readDeals(country));

  const deal = findDealById(store, req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "approved";
  deal.updatedAt = nowIso();

  // Points awarding (award once)
  const POINTS = 25;
  if (deal.createdByUserId && !deal.pointsAwarded) {
    const r = addUserPoints(deal.createdByUserId, POINTS);
    if (r?.ok) {
      deal.pointsAwarded = true;
      deal.pointsAwardedAt = nowIso();
      deal.pointsAwardedAmount = POINTS;
    }
  }

  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, deal });
});

/* =========================
   ADMIN — REJECT
   POST /admin/deals/:id/reject
   FIX: DELETE FROM STORE (SO IT NEVER COMES BACK)
========================= */

router.post("/admin/deals/:id/reject", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureStore(readDeals(country));
  const id = str(req.params.id);

  const before = store.deals.length;
  store.deals = store.deals.filter(
    (d) => String(d?.id || "").trim() !== id
  );

  if (store.deals.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, deleted: true, id });
});

/* =========================
   ADMIN — UPDATE
   PUT /admin/deals/:id
========================= */

router.put("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureAlerts(readDeals(country));

  const idx = findDealIndexById(store, req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const existing = store.deals[idx];
  const oldPrice = Number(existing?.price);

  const patch = req.body || {};
  const next = {
    ...existing,
    ...patch,
    country,
    updatedAt: nowIso(),
  };

  if (patch.url) next.url = normalizeAmazonUrl(patch.url) || str(patch.url) || null;

  const newPrice = Number(next.price);
  if (Number.isFinite(oldPrice) && Number.isFinite(newPrice) && newPrice !== oldPrice) {
    const ts = nowIso();
    store.alerts = Array.isArray(store.alerts)
      ? store.alerts.map((a) => {
          if (
            a &&
            !a.triggeredAt &&
            (a.dealId === next.id || a.deal_id === next.id) &&
            typeof a.targetPrice === "number" &&
            newPrice <= a.targetPrice
          ) {
            return { ...a, triggeredAt: ts, active: false };
          }
          return a;
        })
      : [];
  }

  store.deals[idx] = next;
  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, deal: next });
});

/* =========================
   ADMIN — DELETE (SOFT DELETE)
   DELETE /admin/deals/:id?country=US|CA
========================= */

router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const country = adminCountry(req);
  const store = ensureStore(readDeals(country));

  const deal = findDealById(store, req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "disabled";
  deal.expiresAt = nowIso();
  deal.updatedAt = nowIso();

  store.updatedAt = nowIso();
  writeDeals(country, store);

  res.json({ ok: true, country, id: deal.id });
});

export default router;
