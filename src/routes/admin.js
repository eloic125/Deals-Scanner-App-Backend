import express from "express";
import crypto from "node:crypto";

import {
  readDeals,
  writeDeals,
  getDealKey,
  upsertDeals,
} from "../services/dealStore.js";

const router = express.Router();

/* =====================================================
   ADMIN AUTH
===================================================== */

const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

function requireAdmin(req, res, next) {
  // Base44 admin
  if (req.user?.role === "admin") return next();

  // x-admin-key fallback
  const headerKey = String(req.headers["x-admin-key"] || "").trim();

  if (!ADMIN_KEY) {
    console.error("ADMIN_KEY missing");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  if (headerKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

/* =====================================================
   COUNTRY HANDLING — FINAL, FIXED
===================================================== */

function normalizeCountry(v) {
  return String(v || "").trim().toUpperCase() === "US" ? "US" : "CA";
}

/**
 * ORDER (CRITICAL):
 * 1) ?country=US
 * 2) body.country
 * 3) x-country header  <-- ingest FIX
 * 4) CA default
 */
function resolveCountry(req) {
  if (req.query?.country) return normalizeCountry(req.query.country);
  if (req.body?.country) return normalizeCountry(req.body.country);
  if (req.headers?.["x-country"]) return normalizeCountry(req.headers["x-country"]);
  return "CA";
}

/* =====================================================
   HELPERS
===================================================== */

function normalize(v) {
  return String(v || "").trim();
}

function matchesDeal(deal, idOrKey) {
  return (
    deal?.id === idOrKey ||
    deal?.sourceKey === idOrKey ||
    getDealKey(deal) === idOrKey
  );
}

function ensureStore(store) {
  const s = store && typeof store === "object" ? store : {};
  if (!Array.isArray(s.deals)) s.deals = [];
  if (!Array.isArray(s.reports)) s.reports = [];
  if (!Array.isArray(s.alerts)) s.alerts = [];
  if (!s.updatedAt) s.updatedAt = new Date().toISOString();
  return s;
}

/* =====================================================
   ADMIN CREATE — POST /admin/deals
===================================================== */

router.post("/admin/deals", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  const store = ensureStore(readDeals(country));

  const now = new Date().toISOString();

  const deal = {
    id: req.body?.id || crypto.randomUUID(),
    title: req.body?.title || "Untitled",
    price: Number(req.body?.price || 0),
    originalPrice:
      req.body?.originalPrice != null
        ? Number(req.body.originalPrice)
        : null,
    retailer: req.body?.retailer || "Unknown",
    category: req.body?.category || "Other",
    imageUrl: req.body?.imageUrl || null,
    url: req.body?.url || null,
    notes: req.body?.notes || null,
    status: req.body?.status || "approved",
    expiresAt: req.body?.expiresAt || null,
    country,
    createdAt: now,
    updatedAt: now,
  };

  store.deals.unshift(deal);
  writeDeals(country, store);

  res.json({ ok: true, country, deal });
});

/* =====================================================
   ADMIN BULK UPSERT — POST /admin/deals/bulk
   (INGEST ENTRY POINT — FIXED)
===================================================== */

router.post("/admin/deals/bulk", requireAdmin, (req, res) => {
  const country = resolveCountry(req);

  const incomingRaw = Array.isArray(req.body?.deals) ? req.body.deals : [];
  if (!incomingRaw.length) {
    return res.status(400).json({ error: "No deals provided" });
  }

  // FORCE country (authoritative)
  const incoming = incomingRaw.map((d) => ({
    ...d,
    country,
  }));

  const result = upsertDeals(country, incoming);
  res.json({ ok: true, country, ...result });
});

/* =====================================================
   ADMIN UPDATE — PUT /admin/deals/:id
===================================================== */

router.put("/admin/deals/:id", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  const id = normalize(req.params.id);

  const store = ensureStore(readDeals(country));
  const deal = store.deals.find((d) => matchesDeal(d, id));

  if (!deal) return res.status(404).json({ error: "Deal not found" });

  Object.assign(deal, req.body || {}, {
    country,
    updatedAt: new Date().toISOString(),
  });

  writeDeals(country, store);
  res.json({ ok: true, country, deal });
});

/* =====================================================
   ADMIN DELETE — DELETE /admin/deals/:id
===================================================== */

router.delete("/admin/deals/:id", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  const id = normalize(req.params.id);

  const store = ensureStore(readDeals(country));
  const before = store.deals.length;

  store.deals = store.deals.filter((d) => !matchesDeal(d, id));

  if (store.deals.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals(country, store);
  res.json({ ok: true, country, deleted: before - store.deals.length });
});

/* =====================================================
   ADMIN LIST — GET /admin/deals
===================================================== */

router.get("/admin/deals", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  res.json(readDeals(country));
});

/* =====================================================
   ADMIN REPORTS — GET /admin/reports
===================================================== */

router.get("/admin/reports", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  const store = ensureStore(readDeals(country));
  res.json({ country, reports: store.reports });
});

/* =====================================================
   ADMIN REPORT RESOLVE
===================================================== */

router.post("/admin/reports/:id/resolve", requireAdmin, (req, res) => {
  const country = resolveCountry(req);
  const reportId = normalize(req.params.id);

  const store = ensureStore(readDeals(country));
  const report = store.reports.find((r) => r?.id === reportId);

  if (!report) return res.status(404).json({ error: "Report not found" });

  report.status = "reviewed";
  report.reviewedAt = new Date().toISOString();

  writeDeals(country, store);
  res.json({ ok: true, country, report });
});

/* =====================================================
   PUBLIC REPORT DEAL — POST /reports
===================================================== */

router.post("/reports", (req, res) => {
  const country = resolveCountry(req);
  const dealId = normalize(req.body?.deal_id);
  const reason = normalize(req.body?.reason);

  if (!dealId || !reason) {
    return res.status(400).json({ error: "deal_id and reason required" });
  }

  const store = ensureStore(readDeals(country));
  const deal = store.deals.find((d) => matchesDeal(d, dealId));

  const report = {
    id: crypto.randomUUID(),
    deal_id: dealId,
    reason,
    notes: req.body?.notes || null,
    status: "pending",
    createdAt: new Date().toISOString(),
    dealTitle: deal?.title || null,
  };

  store.reports.unshift(report);
  writeDeals(country, store);

  res.json({ ok: true, country, report });
});

export default router;
