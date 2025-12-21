import express from "express";
import crypto from "node:crypto";
import fs from "fs";
import { featuredProducts } from "../data/featuredProducts.js";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { validateDealLink } from "../services/urlPolicy.js";

const router = express.Router();

function readSecretFile(filename) {
  try {
    const p = `/etc/secrets/${filename}`;
    if (!fs.existsSync(p)) return "";
    return String(fs.readFileSync(p, "utf8") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Admin key
 * - Prefer env var ADMIN_KEY (recommended)
 * - Otherwise read Render Secret File /etc/secrets/ADMIN_KEY
 * - Otherwise fallback (local only)
 */
const ADMIN_KEY =
  (process.env.ADMIN_KEY && process.env.ADMIN_KEY.trim()) ||
  readSecretFile("ADMIN_KEY") ||
  "dev-admin-key";

function requireAdmin(req, res) {
  const adminKey = String(req.headers["x-admin-key"] || "").trim();
  if (!adminKey || adminKey !== ADMIN_KEY) {
    res.status(403).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// host + pathname (ignores tracking query differences)
function canonicalDealKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return String(urlStr || "").trim().toLowerCase();
  }
}

/**
 * GET /admin/deals/pending
 * List deals awaiting approval
 */
router.get("/admin/deals/pending", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const store = readDeals();
    const deals = Array.isArray(store.deals) ? store.deals : [];

    const pending = deals.filter(
      (d) => d && typeof d === "object" && d.status === "pending"
    );

    return res.json({
      updatedAt: store.updatedAt,
      count: pending.length,
      deals: pending,
    });
  } catch (err) {
    console.error("[ADMIN PENDING] Failed:", err.message);
    return res.status(500).json({ error: "Failed to load pending deals" });
  }
});

/**
 * POST /admin/deals/bulk
 * Bulk add deals (admin-only).
 *
 * Modes:
 *  - default "skip": duplicates are skipped
 *  - "upsert": duplicates are updated (same host+path)
 *
 * Set mode via:
 *  - query:  /admin/deals/bulk?mode=upsert
 *  - body:   { mode: "upsert", deals: [...] }
 *
 * Accepts:
 *  - { deals: [...] }   (recommended)
 *  - [...]             (also supported)
 *
 * Each deal item can include:
 *  title, price, url, retailer, source, image, category, notes, inStock
 *
 * Defaults for NEW deals:
 *  - status: "approved"
 *  - source: "curated"
 */
router.post("/admin/deals/bulk", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const modeRaw =
      (typeof req.query.mode === "string" && req.query.mode.trim()) ||
      (typeof req.body?.mode === "string" && req.body.mode.trim()) ||
      "skip";
    const mode = modeRaw.toLowerCase() === "upsert" ? "upsert" : "skip";

    const body = req.body;
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body?.deals)
      ? body.deals
      : null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Body must be an array of deals or an object with { deals: [...] }",
      });
    }

    if (items.length > 200) {
      return res.status(400).json({
        error: "Too many deals in one request (max 200).",
      });
    }

    const store = readDeals();
    const deals = Array.isArray(store.deals) ? store.deals : [];

    // Build index: canonicalKey -> first index
    const indexByKey = new Map();
    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      if (!d || typeof d !== "object" || typeof d.url !== "string") continue;
      const key = canonicalDealKey(d.url);
      if (!indexByKey.has(key)) indexByKey.set(key, i);
    }

    const now = new Date().toISOString();

    const added = [];
    const updated = [];
    const skipped = [];

    for (let i = 0; i < items.length; i++) {
      const input = items[i];

      if (!input || typeof input !== "object") {
        skipped.push({ index: i, reason: "Invalid item (not an object)" });
        continue;
      }

      const title = typeof input.title === "string" ? input.title.trim() : "";
      const url = typeof input.url === "string" ? input.url.trim() : "";
      const retailerLabel =
        typeof input.retailer === "string" && input.retailer.trim()
          ? input.retailer.trim()
          : "Other";

      const retailerKey = retailerLabel.replace(/\s+/g, "");

      const priceNum =
        typeof input.price === "string" ? Number(input.price) : input.price;

      if (!title) {
        skipped.push({ index: i, reason: "Missing title" });
        continue;
      }
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        skipped.push({ index: i, reason: "Missing/invalid price" });
        continue;
      }
      if (!url) {
        skipped.push({ index: i, reason: "Missing url" });
        continue;
      }

      // Validate URL using the same policy as public submissions
      const linkCheck = validateDealLink({ url, retailer: retailerKey });
      if (!linkCheck.ok) {
        skipped.push({ index: i, reason: linkCheck.reason });
        continue;
      }

      const key = canonicalDealKey(linkCheck.normalizedUrl);
      const existingIdx = indexByKey.get(key);

      // DUPLICATE
      if (typeof existingIdx === "number") {
        if (mode !== "upsert") {
          skipped.push({ index: i, reason: "Duplicate (already exists)" });
          continue;
        }

        // UPSERT: update allowed fields, preserve id + moderation status by default
        const existing = deals[existingIdx];
        if (!existing || typeof existing !== "object") {
          skipped.push({
            index: i,
            reason: "Duplicate found but existing record invalid",
          });
          continue;
        }

        deals[existingIdx] = {
          ...existing,

          // Update core content
          title,
          price: priceNum,
          url: linkCheck.normalizedUrl,
          urlHost: linkCheck.host,
          retailer: retailerLabel,

          source:
            typeof input.source === "string" && input.source.trim()
              ? input.source.trim()
              : existing.source || "curated",

          image:
            typeof input.image === "string" && input.image.trim()
              ? input.image.trim()
              : existing.image,

          category:
            typeof input.category === "string" && input.category.trim()
              ? input.category.trim()
              : existing.category,

          notes:
            typeof input.notes === "string" && input.notes.trim()
              ? input.notes.trim()
              : existing.notes,

          inStock:
            typeof input.inStock === "boolean"
              ? input.inStock
              : existing.inStock ?? true,

          // Do NOT auto-change status/review fields for existing items
          updatedAt: now,
        };

        updated.push({ index: i, id: deals[existingIdx].id, key });
        continue;
      }

      // NEW INSERT
      const dealId = crypto.randomUUID();

      const newDeal = {
        id: dealId,
        title,
        price: priceNum,

        url: linkCheck.normalizedUrl,
        urlHost: linkCheck.host,

        retailer: retailerLabel,

        source:
          typeof input.source === "string" && input.source.trim()
            ? input.source.trim()
            : "curated",

        image:
          typeof input.image === "string" && input.image.trim()
            ? input.image.trim()
            : undefined,

        category:
          typeof input.category === "string" && input.category.trim()
            ? input.category.trim()
            : "Other",

        notes:
          typeof input.notes === "string" && input.notes.trim()
            ? input.notes.trim()
            : undefined,

        inStock: typeof input.inStock === "boolean" ? input.inStock : true,

        // Bulk imports are approved by default
        status: "approved",
        submittedAt: now,
        reviewedAt: now,
        reviewedBy: "admin-bulk",
        rejectionReason: null,

        createdAt: now,
        updatedAt: now,
      };

      deals.push(newDeal);
      indexByKey.set(key, deals.length - 1);
      added.push(newDeal);
    }

    writeDeals(deals);

    return res.json({
      ok: true,
      mode,
      addedCount: added.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      skipped,
      updated,
      added,
    });
  } catch (err) {
    console.error("[ADMIN BULK] Failed:", err.message);
    return res.status(500).json({ error: "Failed to bulk add deals" });
  }
});

/**
 * PATCH /admin/deals/:id/approve
 * Approve a pending deal so it becomes visible in /deals
 */
router.patch("/admin/deals/:id/approve", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;
    const now = new Date().toISOString();

    const store = readDeals();
    const deals = Array.isArray(store.deals) ? store.deals : [];

    const idx = deals.findIndex((d) => d && String(d.id) === String(id));
    if (idx === -1) {
      return res.status(404).json({ error: "Deal not found" });
    }

    deals[idx] = {
      ...deals[idx],
      status: "approved",
      reviewedAt: now,
      reviewedBy: "admin",
      rejectionReason: null,
      updatedAt: now,
    };

    writeDeals(deals);

    return res.json({ ok: true, deal: deals[idx] });
  } catch (err) {
    console.error("[ADMIN APPROVE] Failed:", err.message);
    return res.status(500).json({ error: "Failed to approve deal" });
  }
});

/**
 * PATCH /admin/deals/:id/reject
 * Reject a pending deal (optional reason)
 * Body: { reason?: string }
 */
router.patch("/admin/deals/:id/reject", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const now = new Date().toISOString();

    const store = readDeals();
    const deals = Array.isArray(store.deals) ? store.deals : [];

    const idx = deals.findIndex((d) => d && String(d.id) === String(id));
    if (idx === -1) {
      return res.status(404).json({ error: "Deal not found" });
    }

    deals[idx] = {
      ...deals[idx],
      status: "rejected",
      reviewedAt: now,
      reviewedBy: "admin",
      rejectionReason:
        typeof reason === "string" && reason.trim() ? reason.trim() : null,
      updatedAt: now,
    };

    writeDeals(deals);

    return res.json({ ok: true, deal: deals[idx] });
  } catch (err) {
    console.error("[ADMIN REJECT] Failed:", err.message);
    return res.status(500).json({ error: "Failed to reject deal" });
  }
});

/**
 * POST /admin/featured
 * Add a featured product dynamically (Amazon or eBay)
 */
router.post("/admin/featured", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { retailer, id, forceInclude = true } = req.body;

  if (!retailer || !id) {
    return res.status(400).json({
      error: "Missing required fields: retailer, id",
    });
  }

  let product;

  if (retailer === "amazon") {
    product = {
      retailer: "amazon",
      asin: id,
      forceInclude,
    };
  } else if (retailer === "ebay") {
    product = {
      retailer: "ebay",
      itemId: id,
      forceInclude,
    };
  } else {
    return res.status(400).json({ error: "Unsupported retailer" });
  }

  featuredProducts.push(product);

  return res.json({
    success: true,
    added: product,
    totalFeatured: featuredProducts.length,
  });
});

export default router;
