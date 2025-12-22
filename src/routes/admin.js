import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { validateDealLink } from "../services/urlPolicy.js";

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
   CREATE (BULK)
========================= */

router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const inputs = Array.isArray(req.body?.deals)
    ? req.body.deals
    : Array.isArray(req.body)
    ? req.body
    : [];

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];
  const now = new Date().toISOString();

  const added = [];

  for (const input of inputs) {
    if (
      typeof input?.title !== "string" ||
      typeof input?.url !== "string" ||
      input.price === undefined ||
      input.price === null
    ) {
      continue;
    }

    const check = validateDealLink({
      url: input.url,
      retailer: input.retailer,
    });

    if (!check.ok) continue;

    added.push({
      id: crypto.randomUUID(),
      title: input.title.trim(),
      price: Number(input.price),
      url: check.normalizedUrl,
      urlHost: check.host,
      retailer: input.retailer ?? "Other",
      source: "curated",
      status: "approved",
      createdAt: now,
      updatedAt: now,
      category: "Other",
    });
  }

  if (added.length) {
    writeDeals([...deals, ...added]);
  }

  res.json({ ok: true, addedCount: added.length });
});

/* =========================
   DELETE (REST)
========================= */

router.delete("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Deal not found" });
  }

  const removed = deals.splice(idx, 1)[0];
  writeDeals(deals);

  res.json({ ok: true, deletedId: removed.id });
});

/* =========================
   DELETE (Base44 COMPAT)
========================= */

router.post("/admin/deals/:id/delete", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Deal not found" });
  }

  const removed = deals.splice(idx, 1)[0];
  writeDeals(deals);

  res.json({ ok: true, deletedId: removed.id });
});

export default router;
