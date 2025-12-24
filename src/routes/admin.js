import express from "express";
import fs from "fs";
import {
  readDeals,
  upsertDeals,
} from "../services/dealStore.js";
import { validateDealLink } from "../services/urlPolicy.js";
import {
  getCachedImage,
  saveCachedImage,
  productKeyFromUrl,
} from "../services/productImageStore.js";

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
  process.env.ADMIN_KEY?.trim() ||
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
   ADMIN BULK INGEST (SINGLE SOURCE OF TRUTH)
========================= */

router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const inputs = Array.isArray(req.body?.deals)
      ? req.body.deals
      : [];

    if (!inputs.length) {
      return res.status(400).json({
        ok: false,
        error: "No deals provided",
      });
    }

    const now = new Date().toISOString();
    const prepared = [];

    for (const input of inputs) {
      // 🔑 SCREENSHOT / AI DEALS (NO URL REQUIRED)
      if (input.sourceKey && input.title && input.price != null) {
        prepared.push({
          ...input,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      // 🌐 URL DEALS (EXISTING LOGIC)
      if (typeof input?.url !== "string") continue;

      const check = validateDealLink({
        url: input.url,
        retailer: input.retailer,
      });

      if (!check.ok) continue;

      const normalizedUrl = check.normalizedUrl;
      const productKey = productKeyFromUrl(normalizedUrl);

      let imageUrl = null;
      let imageType = null;
      let imageDisclaimer = null;

      if (typeof input.imageUrl === "string" && input.imageUrl.trim()) {
        imageUrl = input.imageUrl.trim();
        imageType = input.imageType ?? "remote";
        imageDisclaimer = input.imageDisclaimer ?? null;

        saveCachedImage({
          url: normalizedUrl,
          imageUrl,
          imageType,
        });
      } else {
        const cached = getCachedImage(normalizedUrl);
        if (cached) {
          imageUrl = cached.imageUrl;
          imageType = cached.imageType ?? null;
          imageDisclaimer = cached.imageDisclaimer ?? null;
        }
      }

      prepared.push({
        ...input,
        url: normalizedUrl,
        urlHost: check.host,
        imageUrl,
        imageType,
        imageDisclaimer,
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = upsertDeals(prepared);

    return res.json({
      ok: true,
      mode: "upsert",
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      total: result.total,
    });
  } catch (err) {
    console.error("[ADMIN BULK] Failed:", err);
    return res.status(500).json({
      ok: false,
      error: "Bulk ingest failed",
    });
  }
});

export default router;
