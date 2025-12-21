import express from "express";
import { trackClick } from "../services/clickTracker.js";

const router = express.Router();

// Affiliate IDs
const AMAZON_TAG = "eloicyr09-20";
const EBAY_CAMPID = "5339134577";

// Helpers
function isAmazonASIN(id) {
  return /^B0[A-Z0-9]{8}$/.test(id);
}

function isEbayItemId(id) {
  return /^[0-9]{9,15}$/.test(id);
}

router.get("/redirect", (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing id" });
  }

  // AMAZON
  if (isAmazonASIN(id)) {
    trackClick({ id, retailer: "amazon" });
    const url = `https://www.amazon.ca/dp/${id}?tag=${AMAZON_TAG}`;
    return res.redirect(302, url);
  }

  // EBAY
  if (isEbayItemId(id)) {
    trackClick({ id, retailer: "ebay" });
    const url = `https://www.ebay.com/itm/${id}?campid=${EBAY_CAMPID}`;
    return res.redirect(302, url);
  }

  return res.status(400).json({ error: "Unknown product id format" });
});

export default router;
