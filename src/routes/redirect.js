import express from "express";
import { trackClick } from "../services/clickTracker.js";
import { readDeals, writeDeals } from "../services/dealStore.js";

const router = express.Router();

// ENV (FAIL LOUD IF MISSING)
const AMAZON_TAG = process.env.AMAZON_TAG_CA;
const EBAY_CAMPID = process.env.EBAY_CAMPAIGN_ID;
const EBAY_CUSTOM_ID = process.env.EBAY_CUSTOM_ID;

if (!AMAZON_TAG) throw new Error("AMAZON_TAG_CA missing");
if (!EBAY_CAMPID) throw new Error("EBAY_CAMPAIGN_ID missing");
if (!EBAY_CUSTOM_ID) throw new Error("EBAY_CUSTOM_ID missing");

// ------------------
// Helpers
// ------------------
function incrementDealClicks(matchFn) {
  const store = readDeals();
  if (!Array.isArray(store.deals)) return;

  const idx = store.deals.findIndex(matchFn);
  if (idx === -1) return;

  store.deals[idx].clicks = (store.deals[idx].clicks || 0) + 1;
  store.deals[idx].updatedAt = new Date().toISOString();

  writeDeals(store);
}

// ==================================================
// EBAY CLICK PROXY — THIS IS WHAT YOU ARE HITTING
// ==================================================
router.get("/go/ebay/:itemId", (req, res) => {
  const { itemId } = req.params;
  const country = req.query.country === "US" ? "US" : "CA";

  trackClick({ id: itemId, retailer: "ebay", country });

  incrementDealClicks(
    d => d.sourceKey === `ebay:${itemId}`
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

  console.log("EBAY_REDIRECT_OK", affiliateUrl);

  return res.redirect(302, affiliateUrl);
});

// ==================================================
// AMAZON CLICK PROXY (CONSISTENT)
// ==================================================
router.get("/go/amazon/:asin", (req, res) => {
  const { asin } = req.params;
  const country = req.query.country === "US" ? "US" : "CA";

  trackClick({ id: asin, retailer: "amazon", country });

  incrementDealClicks(
    d => d.sourceKey === `amazon:${asin}`
  );

  const domain = country === "US" ? "amazon.com" : "amazon.ca";
  const tag = AMAZON_TAG;

  const affiliateUrl =
    `https://www.${domain}/dp/${asin}?tag=${tag}`;

  console.log("AMAZON_REDIRECT_OK", affiliateUrl);

  return res.redirect(302, affiliateUrl);
});

export default router;
