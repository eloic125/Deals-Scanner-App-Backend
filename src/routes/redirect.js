console.log("REDIRECT ROUTES FILE LOADED");

import express from "express";
import { trackClick } from "../services/clickTracker.js";
import { readDeals, writeDeals } from "../services/dealStore.js";

const router = express.Router();

// ENV (NO HARD CODE)
const AMAZON_TAG_CA = process.env.AMAZON_TAG_CA;
const AMAZON_TAG_US = process.env.AMAZON_TAG_US;
const EBAY_CAMPAIGN_ID = process.env.EBAY_CAMPAIGN_ID;
const EBAY_CUSTOM_ID = process.env.EBAY_CUSTOM_ID;

// ---------------- HELPERS ----------------
function isAmazonASIN(id) {
  return /^B0[A-Z0-9]{8}$/.test(id);
}

function isEbayItemId(id) {
  return /^[0-9]{9,15}$/.test(id);
}

function incrementDealClicks(matchFn, country) {
  const store = readDeals({ country });
  if (!Array.isArray(store.deals)) return;

  const idx = store.deals.findIndex(matchFn);
  if (idx === -1) return;

  store.deals[idx].clicks = (store.deals[idx].clicks || 0) + 1;
  store.deals[idx].updatedAt = new Date().toISOString();

  writeDeals(store, { country });
}

// ---------------- UUID → SOURCE REDIRECT ----------------
router.get("/go/:uuid", (req, res) => {
  console.log("UUID ROUTE HIT", req.params.uuid);
  const { uuid } = req.params;
  const country = String(req.query.country || "CA").toUpperCase();

  const store = readDeals({ country });
  if (!Array.isArray(store.deals)) {
    return res.status(500).json({ error: "Deal store invalid" });
  }

  const deal = store.deals.find(d => d.id === uuid);
  if (!deal) {
    return res.status(404).json({ error: "Deal not found" });
  }

  if (!deal.sourceKey) {
    return res.status(500).json({ error: "Deal source missing" });
  }

  const [source, itemId] = deal.sourceKey.split(":");

  return res.redirect(
    302,
    `/go/${source}/${itemId}?country=${country}`
  );
});

// ---------------- SOURCE → ITEM REDIRECT ----------------
router.get("/go/:source/:itemId", (req, res) => {
  const { source, itemId } = req.params;
  const country = String(req.query.country || "CA").toUpperCase();

  // ---------- AMAZON ----------
  if (source === "amazon" && isAmazonASIN(itemId)) {
    trackClick({ id: itemId, retailer: "amazon", country });

    incrementDealClicks(
      d => d.sourceKey === `amazon:${itemId}`,
      country
    );

    const tag = country === "US" ? AMAZON_TAG_US : AMAZON_TAG_CA;
    const url = `https://www.amazon.${country === "US" ? "com" : "ca"}/dp/${itemId}?tag=${tag}`;

    console.log("AMAZON_CLICK_PROXY", url);
    return res.redirect(302, url);
  }

  // ---------- EBAY ----------
  if (source === "ebay" && isEbayItemId(itemId)) {
    trackClick({ id: itemId, retailer: "ebay", country });

    incrementDealClicks(
      d => d.sourceKey === `ebay:${itemId}`,
      country
    );

    const domain = country === "US" ? "www.ebay.com" : "www.ebay.ca";
    const mkrid = country === "US"
      ? "711-53200-19255-0"
      : "706-53473-19255-0";

    const url =
      `https://${domain}/itm/${itemId}` +
      `?mkevt=1` +
      `&mkcid=1` +
      `&mkrid=${mkrid}` +
      `&campid=${EBAY_CAMPAIGN_ID}` +
      `&customid=${EBAY_CUSTOM_ID}`;

    console.log("EBAY_CLICK_PROXY", url);
    return res.redirect(302, url);
  }

  return res.status(400).json({ error: "Invalid redirect request" });
});

// ---------------- LEGACY SUPPORT (KEEP) ----------------
router.get("/redirect", (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  return res.redirect(`/go/amazon/${id}`);
});

export default router;
