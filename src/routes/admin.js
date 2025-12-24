import express from "express";
import crypto from "node:crypto";
import fs from "fs";
import {
  readDeals,
  writeDeals,
  upsertDeals,
} from "../services/dealStore.js";

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
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/* =========================
   ADMIN BULK UPSERT (LIVE)
========================= */

router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const incoming = Array.isArray(req.body?.deals)
      ? req.body.deals
      : [];

    if (!incoming.length) {
      return res.status(400).json({
        ok: false,
        error: "No deals provided",
      });
    }

    // 🔥 THIS IS THE REAL UPSERT
    const result = upsertDeals(incoming);

    return res.json({
      ok: true,
      mode: "upsert",
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      total: result.total,
    });
  } catch (err) {
    console.error("[ADMIN BULK] Failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Bulk ingest failed",
    });
  }
});

/* =========================
   EXPORT
========================= */

export default router;
