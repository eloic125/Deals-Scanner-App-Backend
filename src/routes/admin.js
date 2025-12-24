import express from "express";
import fs from "fs";
import crypto from "node:crypto";
import { readDeals, writeDeals, getDealKey } from "../services/dealStore.js";

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

function requireAdmin(req, res, next) {
  const key = String(req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/* =========================
   HELPERS
========================= */

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

/* =========================
   BULK UPSERT (CREATE + EDIT)
========================= */

router.post("/admin/deals/bulk", requireAdmin, (req, res) => {
  const mode = String(req.query.mode || "").toLowerCase();
  const incoming = Array.isArray(req.body?.deals) ? req.body.deals : [];

  if (!incoming.length) {
    return res.status(400).json({ error: "No deals provided" });
  }

  const store = readDeals();
  const existing = Array.isArray(store.deals) ? store.deals : [];

  const map = new Map();
  for (const d of existing) {
    map.set(getDealKey(d), d);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const deal of incoming) {
    const key = getDealKey(deal);
    if (!key) continue;

    if (mode === "upsert" && map.has(key)) {
      Object.assign(map.get(key), deal, {
        updatedAt: new Date().toISOString(),
      });
      updatedCount++;
    } else {
      map.set(key, {
        id: deal.id || crypto.randomUUID(),
        ...deal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      addedCount++;
    }
  }

  const merged = Array.from(map.values());
  writeDeals(merged);

  res.json({
    ok: true,
    mode: mode || "insert",
    addedCount,
    updatedCount,
    total: merged.length,
  });
});

/* =========================
   UPDATE DEAL (EDIT)
========================= */

router.put("/admin/deals/:id", requireAdmin, (req, res) => {
  const id = normalize(req.params.id);
  const store = readDeals();

  const deal = store.deals.find(d => matchesDeal(d, id));
  if (!deal) return res.status(404).json({ error: "Deal not found" });

  Object.assign(deal, req.body, {
    updatedAt: new Date().toISOString(),
  });

  writeDeals(store.deals);
  res.json({ ok: true, deal });
});

/* =========================
   DELETE DEAL (BASE44 + REST)
========================= */

/* Base44 REQUIRED format */
router.post("/admin/deals/:id/delete", requireAdmin, (req, res) => {
  const id = normalize(req.params.id);
  const store = readDeals();

  const before = store.deals.length;
  const filtered = store.deals.filter(d => !matchesDeal(d, id));

  if (filtered.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals(filtered);
  res.json({ ok: true, deleted: before - filtered.length });
});

/* REST / manual delete */
router.delete("/admin/deals", requireAdmin, (req, res) => {
  const key = normalize(req.query.sourceKey || req.query.id);
  if (!key) {
    return res.status(400).json({ error: "id or sourceKey required" });
  }

  const store = readDeals();
  const before = store.deals.length;

  const filtered = store.deals.filter(d => !matchesDeal(d, key));

  if (filtered.length === before) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals(filtered);
  res.json({ ok: true, deleted: before - filtered.length });
});

/* =========================
   ADMIN LIST (DEBUG)
========================= */

router.get("/admin/deals", requireAdmin, (req, res) => {
  res.json(readDeals());
});

export default router;
