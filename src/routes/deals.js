import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { classifyDealCategory } from "../services/classifyDealCategory.js";

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

/* =========================
   PUBLIC — LIST DEALS
========================= */

router.get("/deals", (req, res) => {
  const { category, sort, maxPrice } = req.query;

  const store = readDeals();
  let deals = Array.isArray(store.deals) ? store.deals : [];

  const now = Date.now();

  deals = deals.filter(d => {
    if (d.status !== "approved") return false;
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= now) return false;
    return true;
  });

  if (category && category !== "All") {
    deals = deals.filter(
      d =>
        String(d.category || "").toLowerCase() ===
        String(category).toLowerCase()
    );
  }

  if (maxPrice) {
    deals = deals.filter(d => Number(d.price) <= Number(maxPrice));
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
    updatedAt: store.updatedAt || new Date().toISOString(),
    count: deals.length,
    deals
  });
});

/* =========================
   PUBLIC — DEAL DETAILS
========================= */

router.get("/deals/:id", (req, res) => {
  const store = readDeals();
  const deal = (store.deals || []).find(d => d.id === req.params.id);

  if (!deal)
    return res.json({
      missing: true,
      message: "Deal not found (maybe deleted)"
    });

  res.json(deal);
});

/* =========================
   USER — SUBMIT DEAL
========================= */

router.post("/deals", async (req, res) => {
  const body = req.body || {};
  const store = readDeals();
  const now = new Date().toISOString();

  if (!body.title || typeof body.price !== "number") {
    return res.status(400).json({
      error: "title and price are required"
    });
  }

  let category = "Other";

  try {
    category = await classifyDealCategory({
      title: body.title,
      description: body.notes || body.description || ""
    });
  } catch {
    category = "Other";
  }

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
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    clicks: 0
  };

  store.deals.unshift(deal);
  writeDeals(store);

  res.status(201).json({
    ok: true,
    pending: !isAdmin,
    deal
  });
});

/* =========================
   USER — REPORT DEAL (OLD)
========================= */

router.post("/deals/:id/report", (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const store = ensureReports(readDeals());

  const deal = (store.deals || []).find(d => d.id === id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  if (!body.reason)
    return res.status(400).json({ error: "reason is required" });

  const report = {
    id: crypto.randomUUID(),
    dealId: id,
    reason: String(body.reason),
    notes: body.notes ? String(body.notes) : null,
    userId: req.user?.id || body.userId || null,
    status: "pending",
    user_seen: false,
    createdAt: new Date().toISOString()
  };

  store.reports.push(report);
  writeDeals(store);

  res.json({ ok: true, report });
});

/* =========================
   USER — REPORT DEAL (Base44 /reportDeal)
========================= */

router.post("/reportDeal", (req, res) => {
  try {
    const store = ensureReports(readDeals());

    const dealId =
      req.body?.dealId ||
      req.body?.deal_id ||
      "";

    const reason = (req.body?.reason || "").trim();
    const notes = (req.body?.notes || "").trim() || null;

    if (!dealId || !reason) {
      return res
        .status(400)
        .json({ error: "Deal ID and reason are required" });
    }

    const deal = (store.deals || []).find(d => d.id === dealId);
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const report = {
      id: crypto.randomUUID(),
      dealId,
      reason,
      notes,
      userId: req.user?.id || null,
      status: "pending",
      user_seen: false,
      createdAt: new Date().toISOString()
    };

    store.reports.unshift(report);

    writeDeals(store);

    res.json({ ok: true, report });
  } catch (err) {
    console.error("reportDeal failed:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

/* =========================
   ADMIN — CREATE / MANAGE DEALS
========================= */

router.post("/admin/deals", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const store = readDeals();
  const now = new Date().toISOString();

  if (!body.title || typeof body.price !== "number")
    return res.status(400).json({ error: "title and price required" });

  let category = "Other";

  try {
    category = await classifyDealCategory({
      title: body.title,
      description: body.notes || ""
    });
  } catch {
    category = "Other";
  }

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
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    clicks: 0
  };

  store.deals.unshift(deal);
  writeDeals(store);

  res.status(201).json({ ok: true, deal });
});

router.get("/admin/deals/pending", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const store = readDeals();
  const deals = (store.deals || []).filter(d => d.status === "pending");

  res.json({ ok: true, deals });
});

router.post("/admin/deals/:id/approve", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const store = readDeals();

  const deal = store.deals.find(d => d.id === id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "approved";
  deal.updatedAt = new Date().toISOString();

  writeDeals(store);
  res.json({ ok: true, deal });
});

router.post("/admin/deals/:id/reject", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const store = readDeals();

  const deal = store.deals.find(d => d.id === id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  deal.status = "rejected";
  deal.updatedAt = new Date().toISOString();

  writeDeals(store);
  res.json({ ok: true, deal });
});

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
