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
   ADMIN ROUTES
========================= */

/**
 * POST /admin/deals/bulk
 * FORCE-CREATE DEALS (NO SILENT SKIP)
 */
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
    // ONLY HARD REQUIREMENTS
    if (typeof input?.title !== "string" || typeof input?.url !== "string") {
      continue;
    }

    const check = validateDealLink({
      url: input.url,
      retailer: input.retailer,
    });

    if (!check.ok) continue;

    const price =
      input.price === undefined || input.price === null
        ? 0
        : Number(input.price);

    added.push({
      id: crypto.randomUUID(),
      title: input.title.trim(),
      price,
      url: check.normalizedUrl,
      urlHost: check.host,
      retailer: input.retailer ?? "Other",
      source: "curated",
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
  }

  // WRITE EVEN IF EMPTY (NO HIDDEN LOGIC)
  writeDeals([...deals, ...added]);

  res.json({
    ok: true,
    addedCount: added.length,
  });
});

export default router;
