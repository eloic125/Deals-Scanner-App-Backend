import express from "express";
import { trackClick } from "../services/clickTracker.js";
import { readDeals, writeDeals } from "../services/dealStore.js";

const router = express.Router();

/* =====================================================
   AFFILIATE CONFIG (ENV FIRST)
===================================================== */
const AMAZON_TAG = process.env.AMAZON_TAG_CA || "eloicyr09-20";
const EBAY_CAMPID = process.env.EBAY_CAMPAIGN_ID || "5339134577";
const EBAY_CUSTOM_ID = process.env.EBAY_CUSTOM_ID || "dealsscanner";

/* =====================================================
   HELPERS
===================================================== */
function isAmazonASIN(id) {
  return /^B0[A-Z0-9]{8}$/.test(id);
}

function isEbayItemId(id) {
  return /^[0-9]{9,15}$/.test(id);
}

// Increment clicks inside deals.json
function incrementDealClicks(matchFn) {
  const store = readDeals();
  if (!Array.isArray(store.deals)) return;

  const idx = store.deals.findIndex(matchFn);
  if (idx === -1) return;

  store.deals[idx].clicks = (store.deals[idx].clicks || 0) + 1;
  store.deals[idx].updatedAt = new Date().toISOString();

  writeDeals(store);
}

/* =====================================================
   🔥 NEW — EBAY CLICK PROXY (USED BY INGEST)
   /go/ebay/:itemId
===================================================== */
router.get("/go/ebay/:itemId", (req, res) => {
  const { itemId } = req.params;
  const country = String(req.query.country || "CA").toUpperCase();

  if (!isEbayItemId(itemId)) {
    return res.status(400).json({ error: "Invalid eBay item id" });
  }

  trackClick({ id: itemId, retailer: "ebay" });

  incrementDealClicks(
    d => d.id === itemId || d.sourceKey === `ebay:${itemId}`
  );

  const domain = country === "US" ? "www.ebay.com" : "www.ebay.ca";
  const mkrid =
    country === "US"
      ? "711-53200-19255-0"
      : "706-53473-19255-0";

  const affiliateUrl =
    `https://${domain}/itm/${encodeURIComponent(itemId)}` +
    `?mkevt=1` +
    `&mkcid=1` +
    `&mkrid=${mkrid}` +
    `&campid=${EBAY_CAMPID}` +
    `&customid=${EBAY_CUSTOM_ID}`;

  // ✅ HARD PROOF IN LOGS
  console.log("EBAY_REDIRECT_OK", {
    itemId,
    country,
    affiliateUrl,
  });

  return res.redirect(302, affiliateUrl);
});

/* =====================================================
   LEGACY ROUTE (KEEP — DO NOT BREAK OLD LINKS)
   /redirect?id=XXXX
===================================================== */
router.get("/redirect", (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing id" });
  }

  // AMAZON
  if (isAmazonASIN(id)) {
    trackClick({ id, retailer: "amazon" });

    incrementDealClicks(
      d => d.id === id || d.sourceKey === `amazon:${id}`
    );

    const url = `https://www.amazon.ca/dp/${id}?tag=${AMAZON_TAG}`;
    return res.redirect(302, url);
  }

  // EBAY (LEGACY — DEFAULT US)
  if (isEbayItemId(id)) {
    trackClick({ id, retailer: "ebay" });

    incrementDealClicks(
      d => d.id === id || d.sourceKey === `ebay:${id}`
    );

    const url =
      `https://www.ebay.com/itm/${id}` +
      `?mkevt=1&mkcid=1&campid=${EBAY_CAMPID}&customid=${EBAY_CUSTOM_ID}`;

    return res.redirect(302, url);
  }

  return res.status(400).json({ error: "Unknown product id format" });
});

export default router;
