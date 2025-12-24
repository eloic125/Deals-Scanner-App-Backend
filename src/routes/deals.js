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
   GET DEALS (PUBLIC / ADMIN)
========================= */

router.get("/deals", (req, res) => {
  const store = readDeals();
  res.json(store);
});

/* =========================
   UPDATE DEAL (PUT) — BASE44 SAVE
========================= */

router.put("/admin/deals/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const updates = req.body || {};

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Deal not found" });
  }

  const existing = deals[idx];
  const now = new Date().toISOString();

  const updated = {
    ...existing,

    title:
      typeof updates.title === "string"
        ? updates.title.trim()
        : existing.title,

    price:
      typeof updates.price === "number"
        ? updates.price
        : existing.price,

    originalPrice:
      typeof updates.originalPrice === "number"
        ? updates.originalPrice
        : existing.originalPrice,

    retailer:
      typeof updates.retailer === "string"
        ? updates.retailer
        : existing.retailer,

    category:
      typeof updates.category === "string"
        ? updates.category
        : existing.category,

    status:
      typeof updates.status === "string"
        ? updates.status
        : existing.status,

    imageUrl:
      typeof updates.imageUrl === "string"
        ? updates.imageUrl
        : existing.imageUrl,

    notes:
      typeof updates.notes === "string"
        ? updates.notes
        : existing.notes,

    updatedAt: now,
  };

  deals[idx] = updated;
  writeDeals(deals);

  res.json({ ok: true, deal: updated });
});

/* =========================
   DELETE DEAL (REST)
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
   DELETE DEAL (Base44 COMPAT)
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
