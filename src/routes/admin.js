import express from "express";
import fs from "fs";
import { readDeals, upsertDeals } from "../services/dealStore.js";

const router = express.Router();

/* =========================
   ADMIN AUTH
========================= */
const ADMIN_KEY = process.env.ADMIN_KEY?.trim();
if (!ADMIN_KEY) throw new Error("ADMIN_KEY missing");

function requireAdmin(req, res) {
  const key = String(req.headers["x-admin-key"] || "").trim();
  if (key !== ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/* =========================
   BULK UPSERT (INGEST TARGET)
========================= */
router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const deals = Array.isArray(req.body?.deals) ? req.body.deals : [];
  if (!deals.length) {
    return res.status(400).json({ ok: false, error: "No deals" });
  }

  const result = upsertDeals(deals);
  res.json({ ok: true, ...result });
});

export default router;
