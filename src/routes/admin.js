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
   ADMIN AUTH – uses authenticated Base44 user
===================================================== */

function requireAdmin(req, res, next) {
  try {
    // Base44 should already populate req.user
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  } catch (err) {
    console.error("Admin check failed:", err);
    res.status(500).json({ error: "Admin check failed" });
  }
}

function normalize(v) {
  return String(v || "").trim();
}

function matchesDeal(deal, idOrKey) {
  return (
    deal.id === idOrKey ||
    deal.sourceKey === idOrKey ||
    getDealKey(deal) === idOrKey
  );
}

/* =====================================================
   UTILITY — ENSURE REPORTS ARRAY EXISTS
===================================================== */

function ensureReports(store) {
  if (!Array.isArray(store.reports)) {
    store.reports = [];
  }
  return store;
}

/* =====================================================
   CREATE — POST /admin/deals
===================================================== */

router.post("/admin/deals", requireAdmin, (req, res) => {
  const body = req.body || {};
  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const now = new Date().toISOString();

  const deal = {
    id: body.id || crypto.randomUUID(),
    title: body.title || "Untitled",
    price: body.price ? Number(body.price) : 0,
    originalPrice: body.originalPrice ? Number(body.originalPrice) : null,
    retailer: body.retailer || "Unknown",
    category: body.category || "Other",
    imageUrl: body.imageUrl || "",
    url: body.url || "",
    notes: body.notes || "",
    status: body.status || "approved",
    expiresAt: body.expiresAt || null,
    createdAt: now,
    updatedAt: now,
  };

  deals.unshift(deal);
  writeDeals({ ...store, deals });

  res.json({ ok: true, deal });
});

/* =====================================================
   BULK UPSERT — POST /admin/deals/bulk
===================================================== */

router.post("/admin/deals/bulk", requireAdmin, (req, res) => {
  const incoming = Array.isArray(req.body?.deals) ? req.body.deals : [];

  if (!incoming.length) {
    return res.status(400).json({ error: "No deals provided" });
  }

  const result = upsertDeals(incoming);
  res.json(result);
});

/* =====================================================
   UPDATE — PUT /admin/deals/:id
===================================================== */

router.put("/admin/deals/:id", requireAdmin, (req, res) => {
  const id = normalize(req.params.id);
  const store = readDeals();
  const deals = store.deals;

  const deal = deals.find((d) => matchesDeal(d, id));
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  Object.assign(deal, req.body, {
    updatedAt: new Date().toISOString(),
  });

  writeDeals(store);
  res.json({ ok: true, deal });
});

/* =====================================================
   DELETE — DELETE /admin/deals/:id
===================================================== */

router.delete("/admin/deals/:id", requireAdmin, (req, res) => {
  const id = normalize(req.params.id);
  const store = readDeals();
  const before = store.deals.length;

  const filtered = store.deals.filter((d) => !matchesDeal(d, id));

  if (filtered.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals({ ...store, deals: filtered });
  res.json({ ok: true, deleted: before - filtered.length });
});

/* =====================================================
   DELETE — POST /admin/deals/:id/delete
===================================================== */

router.post("/admin/deals/:id/delete", requireAdmin, (req, res) => {
  const id = normalize(req.params.id);
  const store = readDeals();
  const before = store.deals.length;

  const filtered = store.deals.filter((d) => !matchesDeal(d, id));

  if (filtered.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals({ ...store, deals: filtered });
  res.json({ ok: true, deleted: before - filtered.length });
});

/* =====================================================
   DELETE — DELETE /admin/deals?id=...
===================================================== */

router.delete("/admin/deals", requireAdmin, (req, res) => {
  const key = normalize(req.query.sourceKey || req.query.id);

  if (!key) {
    return res.status(400).json({ error: "id or sourceKey required" });
  }

  const store = readDeals();
  const before = store.deals.length;

  const filtered = store.deals.filter((d) => !matchesDeal(d, key));

  if (filtered.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals({ ...store, deals: filtered });
  res.json({ ok: true, deleted: before - filtered.length });
});

/* =====================================================
   ADMIN LIST — GET /admin/deals
===================================================== */

router.get("/admin/deals", requireAdmin, (req, res) => {
  res.json(readDeals());
});

/* =====================================================
   REPORTS — ADMIN VIEW ALL
===================================================== */

router.get("/admin/reports", requireAdmin, (req, res) => {
  const store = ensureReports(readDeals());
  res.json({ reports: store.reports || [] });
});

/* =====================================================
   REPORTS — ADMIN RESOLVE
===================================================== */

router.post("/admin/reports/:id/resolve", requireAdmin, (req, res) => {
  const reportId = normalize(req.params.id);
  const store = ensureReports(readDeals());

  const report = store.reports.find((r) => r.id === reportId);
  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  report.status = "reviewed";
  report.reviewedAt = new Date().toISOString();

  writeDeals(store);
  res.json({ ok: true, report });
});

export default router;
