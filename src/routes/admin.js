import express from "express";
import crypto from "node:crypto";
import fs from "fs";
import { featuredProducts } from "../data/featuredProducts.js";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { validateDealLink } from "../services/urlPolicy.js";

const router = express.Router();

/* =========================
   ADMIN AUTH
========================= */

function readSecretFile(filename) {
  try {
    const p = `/etc/secrets/${filename}`;
    if (!fs.existsSync(p)) return "";
    return String(fs.readFileSync(p, "utf8") || "").trim();
  } catch {
    return "";
  }
}

const ADMIN_KEY =
  (process.env.ADMIN_KEY && process.env.ADMIN_KEY.trim()) ||
  readSecretFile("ADMIN_KEY");

if (!ADMIN_KEY) {
  throw new Error("ADMIN_KEY is missing");
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

function canonicalDealKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return String(urlStr || "").trim().toLowerCase();
  }
}

/* =========================
   ADMIN ROUTES
========================= */

/**
 * GET /admin/deals/pending
 */
router.get("/admin/deals/pending", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];
  const pending = deals.filter((d) => d?.status === "pending");

  res.json({ count: pending.length, deals: pending });
});

/**
 * PATCH /admin/deals/:id
 * EDIT DEAL
 */
router.patch("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const { title, price, url, notes } = req.body || {};
  const store = readDeals();
  const deals = store.deals || [];

  const idx = deals.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  let normalizedUrl = deals[idx].url;
  let urlHost = deals[idx].urlHost;

  if (typeof url === "string" && url.trim()) {
    const check = validateDealLink({
      url: url.trim(),
      retailer: deals[idx].retailer,
    });
    if (!check.ok) return res.status(400).json({ error: check.reason });
    normalizedUrl = check.normalizedUrl;
    urlHost = check.host;
  }

  deals[idx] = {
    ...deals[idx],
    title: title ?? deals[idx].title,
    price: Number.isFinite(Number(price)) ? Number(price) : deals[idx].price,
    url: normalizedUrl,
    urlHost,
    notes: typeof notes === "string" ? notes : deals[idx].notes,
    updatedAt: new Date().toISOString(),
  };

  writeDeals(deals);
  res.json({ ok: true, deal: deals[idx] });
});

/**
 * DELETE /admin/deals/:id
 * CORRECT REST DELETE
 */
router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const store = readDeals();
  const deals = store.deals || [];

  const idx = deals.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  deals.splice(idx, 1);
  writeDeals(deals);

  res.json({ ok: true, deletedId: id });
});

/**
 * POST /admin/deals/:id/delete
 * ✅ BASE44 COMPATIBILITY FIX
 */
router.post("/admin/deals/:id/delete", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const store = readDeals();
  const deals = store.deals || [];

  const idx = deals.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: "Deal not found" });

  deals.splice(idx, 1);
  writeDeals(deals);

  res.json({ ok: true, deletedId: id });
});

/**
 * POST /admin/deals/bulk
 */
router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const items = Array.isArray(req.body?.deals)
    ? req.body.deals
    : Array.isArray(req.body)
    ? req.body
    : [];

  const store = readDeals();
  const deals = store.deals || [];
  const now = new Date().toISOString();

  const added = [];

  for (const input of items) {
    if (!input?.title || !input?.url || !input?.price) continue;

    const check = validateDealLink({
      url: input.url,
      retailer: input.retailer,
    });
    if (!check.ok) continue;

    added.push({
      id: crypto.randomUUID(),
      title: input.title,
      price: Number(input.price),
      url: check.normalizedUrl,
      urlHost: check.host,
      retailer: input.retailer ?? "Other",
      source: "curated",
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
  }

  writeDeals([...deals, ...added]);
  res.json({ ok: true, addedCount: added.length });
});

export default router;
