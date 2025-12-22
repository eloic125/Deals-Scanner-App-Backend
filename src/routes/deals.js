import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";
import { featuredProducts } from "../data/featuredProducts.js";
import { buildAmazonDeal } from "../services/dealBuilder.js";
import { validateDealLink } from "../services/urlPolicy.js";

const router = express.Router();

// ---------------- Anti-abuse (local, no deps) ----------------
// In-memory rate limit resets on server restart and is per-instance.
const SUBMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SUBMIT_MAX = 10; // max submissions per IP per window
const submitBuckets = new Map();

const DUP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function getClientIp(req) {
  // Prefer proxy headers when present (Cloudflare/Render), fallback to req.ip
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();

  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();

  return req.ip || "unknown";
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  // cleanup expired buckets
  for (const [key, val] of submitBuckets) {
    if (val.resetAt <= now) submitBuckets.delete(key);
  }

  const bucket = submitBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    submitBuckets.set(ip, { count: 1, resetAt: now + SUBMIT_WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= SUBMIT_MAX) {
    const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, reason: `Too many submissions. Try again in ${seconds}s.` };
  }

  bucket.count += 1;
  return { ok: true };
}

function canonicalDealKey(urlStr) {
  try {
    const u = new URL(urlStr);
    // host + pathname (ignores tracking query differences)
    return `${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return String(urlStr || "").trim().toLowerCase();
  }
}
// -------------------------------------------------------------

/**
 * Simple keyword-based category inference (NOT AI)
 * Only used when a deal has no category set.
 * Keep labels aligned with your Discover tiles.
 */
function inferCategoryFromTitle(title) {
  const t = (title || "").toLowerCase();

  const rules = [
    {
      category: "Audio & Headphones",
      keywords: ["airpods", "earbud", "earbuds", "headphone", "headphones", "sony wh", "speaker", "beats"],
    },
    {
      category: "Gaming",
      keywords: ["ps5", "playstation", "xbox", "nintendo", "switch", "controller", "gaming", "gpu", "console"],
    },
    {
      category: "Computers & Tech",
      keywords: ["ssd", "laptop", "pc", "keyboard", "mouse", "monitor", "ram", "router", "nvme", "motherboard"],
    },
    {
      category: "Phones & Accessories",
      keywords: ["iphone", "samsung", "pixel", "case", "charger", "usb-c", "magsafe", "power bank"],
    },
    {
      category: "Home & Living",
      keywords: ["vacuum", "kitchen", "blender", "air fryer", "lamp", "chair", "sofa", "table"],
    },
    { category: "Fashion", keywords: ["shoe", "shoes", "sneaker", "jacket", "hoodie", "jeans", "shirt", "dress"] },
  ];

  for (const r of rules) {
    if (r.keywords.some((k) => t.includes(k))) return r.category;
  }
  return "Other";
}

function normalizeCategory(value, fallbackTitle) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return inferCategoryFromTitle(fallbackTitle);
}

/**
 * GET /deals
 * Frontend-safe deal feed (APPROVED ONLY)
 * Supports filters: source, q, category
 */
router.get("/deals", (req, res) => {
  try {
    const store = readDeals();
    let deals = Array.isArray(store.deals) ? store.deals : [];

    // Only show approved deals in the public feed.
    // Backward-compat: older deals with no status are treated as approved.
    deals = deals
      .filter((d) => d && typeof d === "object")
      .filter((d) => !d.status || d.status === "approved");

    const { limit = "50", offset = "0", sort = "newest", source, q, category } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Normalize categories for all deals (computed if missing)
    deals = deals.map((d) => ({
      ...d,
      category: normalizeCategory(d.category, d.title),
    }));

    // ---- Filters ----
    if (source) {
      deals = deals.filter((d) => d.source === source);
    }

    if (category && String(category).trim() && String(category).toLowerCase() !== "all") {
      const cat = String(category).trim().toLowerCase();
      deals = deals.filter((d) => String(d.category || "").toLowerCase() === cat);
    }

    if (q) {
      const query = String(q).toLowerCase();
      deals = deals.filter((d) => typeof d.title === "string" && d.title.toLowerCase().includes(query));
    }

    const totalCount = deals.length;

    // ---- Sorting ----
    if (sort === "price_asc") {
      deals.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    } else if (sort === "price_desc") {
      deals.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    } else {
      // newest (default)
      deals = deals.slice().reverse();
    }

    // ---- Pagination ----
    const pagedDeals = deals.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      updatedAt: store.updatedAt,
      count: totalCount,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + parsedLimit < totalCount,
      deals: pagedDeals,
    });
  } catch (err) {
    console.error("[DEALS] Failed:", err.message);
    res.status(500).json({ error: "Failed to load deals" });
  }
});

/**
 * GET /deals/:id
 * Public deal details (APPROVED ONLY)
 */
router.get("/deals/:id", (req, res) => {
  try {
    const { id } = req.params;

    const store = readDeals();
    const deals = Array.isArray(store.deals) ? store.deals : [];

    const deal = deals.find((d) => d && typeof d === "object" && d.id === id);

    // Not found OR not approved (pending/rejected) => 404
    if (!deal || (deal.status && deal.status !== "approved")) {
      return res.status(404).json({ error: "Deal not found" });
    }

    return res.json({
      ...deal,
      category: normalizeCategory(deal.category, deal.title),
    });
  } catch (err) {
    console.error("[GET /deals/:id] Failed:", err.message);
    return res.status(500).json({ error: "Failed to load deal" });
  }
});

/**
 * POST /deals
 * Community submission: ALWAYS PENDING (requires admin approval)
 * Accepts optional category; if missing, we infer from title (keyword rules).
 *
 * Security:
 * - Enforces retailer/domain allowlist for known retailers
 * - For "Other", strict URL rules (https-only, no shorteners, no IPs, etc.)
 * Anti-abuse:
 * - Honeypot
 * - Rate limit (per IP)
 * - Duplicate blocking (same host+path within 14 days)
 * - Length limits
 */
router.post("/deals", (req, res) => {
  try {
    const { title, price, url, retailer, source, image, category, notes, website } = req.body || {};

    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const cleanUrl = typeof url === "string" ? url.trim() : "";

    // Retailer label for display (what we store)
    const cleanRetailer =
      typeof retailer === "string" && retailer.trim().length > 0 ? retailer.trim() : "Other";

    // Retailer key for allowlist matching (so "Best Buy" => "BestBuy")
    const retailerKey = cleanRetailer.replace(/\s+/g, "");

    const priceNum = typeof price === "string" ? Number(price) : price;
    const cleanNotes = typeof notes === "string" ? notes.trim() : "";

    // Honeypot: real users never fill this; bots often do
    if (typeof website === "string" && website.trim()) {
      return res.status(400).json({ error: "Invalid submission" });
    }

    // Rate limit (per IP)
    const rl = checkRateLimit(req);
    if (!rl.ok) {
      return res.status(429).json({ error: rl.reason });
    }

    // Length limits (anti-garbage)
    if (cleanTitle.length > 140) {
      return res.status(400).json({ error: "Title is too long (max 140 chars)" });
    }
    if (cleanRetailer.length > 40) {
      return res.status(400).json({ error: "Retailer is too long (max 40 chars)" });
    }
    if (cleanNotes && cleanNotes.length > 500) {
      return res.status(400).json({ error: "Notes is too long (max 500 chars)" });
    }

    // Minimal validation
    if (!cleanTitle) {
      return res.status(400).json({ error: "Missing or invalid title" });
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: "Missing or invalid price" });
    }
    if (!cleanUrl) {
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    // URL security + retailer/domain policy
    const linkCheck = validateDealLink({ url: cleanUrl, retailer: retailerKey });
    if (!linkCheck.ok) {
      return res.status(400).json({ error: linkCheck.reason });
    }

    // Stricter "Other": require notes to help moderation
    if (retailerKey === "Other" && cleanNotes.length < 5) {
      return res.status(400).json({
        error: "For 'Other' retailers, please add notes (min 5 characters) to help moderation.",
      });
    }

    const store = readDeals();
    const existingDeals = Array.isArray(store.deals) ? store.deals : [];

    // Duplicate blocking: same host+path submitted recently (any status)
    const incomingKey = canonicalDealKey(linkCheck.normalizedUrl);
    const nowMs = Date.now();

    const isDup = existingDeals.some((d) => {
      if (!d || typeof d !== "object") return false;
      if (!d.url) return false;

      const dKey = canonicalDealKey(d.url);
      if (dKey !== incomingKey) return false;

      const t = Date.parse(d.submittedAt || d.createdAt || d.updatedAt || "");
      if (!Number.isFinite(t)) return true; // if no timestamp, treat as dup
      return nowMs - t < DUP_WINDOW_MS;
    });

    if (isDup) {
      return res.status(409).json({ error: "This deal link was already submitted recently." });
    }

    const now = new Date().toISOString();
    const dealId = crypto.randomUUID();

    const newDeal = {
      id: dealId,
      title: cleanTitle,
      price: priceNum,

      // Store normalized link + host (useful for UI/moderation)
      url: linkCheck.normalizedUrl,
      urlHost: linkCheck.host,

      retailer: cleanRetailer,

      // Keep source controlled; default to community
      source: typeof source === "string" && source.trim() ? source.trim() : "community",

      // Optional fields (safe)
      image: typeof image === "string" && image.trim() ? image.trim() : undefined,
      category: normalizeCategory(category, cleanTitle),

      // Notes are helpful especially for "Other"
      notes: cleanNotes ? cleanNotes : undefined,

      // Moderation fields
      status: "pending",
      submittedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,

      // Backward-safe fields
      inStock: true,
      createdAt: now,
      updatedAt: now,
    };

    existingDeals.push(newDeal);
    writeDeals(existingDeals);

    return res.status(201).json({
      ok: true,
      message: "Submitted for approval",
      dealId,
      status: "pending",
    });
  } catch (err) {
    console.error("[POST /deals] Failed:", err.message);
    return res.status(500).json({ error: "Failed to submit deal" });
  }
});

/**
 * GET /featured
 * Curated affiliate-safe catalog
 */
router.get("/featured", async (req, res) => {
  const results = [];

  for (const product of featuredProducts) {
    try {
      const deal = await buildAmazonDeal(product);
      if (!deal) continue;

      results.push({
        ...deal,
        affiliate: true,
        category: normalizeCategory(deal.category, deal.title),
      });
    } catch (err) {
      console.error("[FEATURED] Failed:", err.message);
    }
  }

  res.json(results);
});

export default router;
