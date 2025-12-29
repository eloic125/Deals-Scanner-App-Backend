import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";

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
   AMAZON URL NORMALIZER
========================= */

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

/* =========================
   ENSURE REPORT STORE
========================= */

function ensureReports(store) {
  if (!Array.isArray(store.reports)) store.reports = [];
  return store;
}

/* =========================
   PUBLIC — GET DEALS
========================= */

router.get("/deals", (req, res) => {
  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const now = Date.now();

  const visible = deals.filter(d => {
    if (d.status !== "approved") return false;
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= now) return false;
    return true;
  });

  res.json({
    updatedAt: store.updatedAt || new Date().toISOString(),
    count: visible.length,
    deals: visible
  });
});

/* =========================
   FRONTEND DEAL DETAILS SAFE
========================= */

router.get("/deals/:id", (req, res) => {
  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const deal = deals.find(d => d.id === id);

  if (!deal)
    return res.json({
      missing: true,
      message: "Deal not found (maybe deleted)"
    });

  res.json(deal);
});

/* =========================
   USER REPORT DEAL
========================= */

router.post("/deals/:id/report", (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const store = ensureReports(readDeals());
  const deals = store.deals || [];

  const deal = deals.find(d => d.id === id);

  if (!deal)
    return res.status(404).json({ error: "Deal not found" });

  if (!body.reason)
    return res.status(400).json({ error: "reason is required" });

  const report = {
    id: crypto.randomUUID(),
    dealId: id,
    reason: String(body.reason),
    notes: body.notes ? String(body.notes) : null,
    userId: body.userId || null,
    status: "pending",
    user_seen: false,
    createdAt: new Date().toISOString()
  };

  store.reports.push(report);
  writeDeals(store);

  res.json({ ok: true, report });
});

/* =========================
   CREATE DEAL (ADMIN)
========================= */

router.post("/admin/deals", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};

  if (!body.title || typeof body.price !== "number")
    return res.status(400).json({
      error: "title and price required"
    });

  const store = readDeals();
  const now = new Date().toISOString();

  const deal = {
    id: crypto.randomUUID(),
    title: String(body.title),
    price: body.price,
    originalPrice: body.originalPrice || null,
    retailer: body.retailer || "Amazon",
    category: body.category || "General",
    imageUrl: body.imageUrl || null,
    notes: body.notes || null,
    url: normalizeAmazonUrl(body.url),
    status: "approved",
    createdAt: now,
    updatedAt: now,
    expiresAt: null
  };

  store.deals.unshift(deal);
  writeDeals(store);

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

  const idx = store.deals.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  const next = {
    ...store.deals[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (updates.url) next.url = normalizeAmazonUrl(updates.url);

  store.deals[idx] = next;

  writeDeals(store);
  res.json({ ok: true, deal: next });
});

/* =========================
   DISABLE DEAL (ADMIN)
========================= */

router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const store = readDeals();

  const idx = store.deals.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  store.deals[idx].status = "disabled";
  store.deals[idx].expiresAt = new Date().toISOString();
  store.deals[idx].updatedAt = new Date().toISOString();

  writeDeals(store);
  res.json({ ok: true });
});

export default router;
