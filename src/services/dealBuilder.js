import { Deal } from "../domain/deal.js";
import { fetchAmazonData } from "../fetchers/amazonFetcher.js";
import { DEAL_RULES } from "../domain/dealRules.js";

/**
 * Build a deal (Amazon or eBay).
 * Manual deals bypass validation.
 */
export async function buildAmazonDeal(product) {
  const {
    retailer,
    asin,
    itemId,
    title,
    regularPrice = null,
    expectedKeywords = [],
    forceInclude = false
  } = product;

  const id = retailer === "ebay" ? itemId : asin;
  const url =
    retailer === "ebay"
      ? `https://www.ebay.com/itm/${itemId}`
      : `https://www.amazon.ca/dp/${asin}`;

  // --- FORCE INCLUDE (manual deals) ---
  if (forceInclude) {
    return new Deal({
      id,
      title: title || id,
      currentPrice: null,
      regularPrice,
      discountPercent: null,
      retailer: retailer === "ebay" ? "eBay" : "Amazon",
      url,
      manual: true,
      lastUpdated: new Date()
    });
  }

  // ⛔ Below this point = Amazon only (future-proof)
  if (retailer !== "amazon") return null;

  if (!regularPrice || regularPrice <= 0) return null;

  // --- IDENTITY CHECK ---
  const titleLower = title.toLowerCase();
  for (const keyword of expectedKeywords) {
    if (!titleLower.includes(keyword.toLowerCase())) {
      return null;
    }
  }

  // --- FETCH AMAZON DATA ---
  const data = await fetchAmazonData(url);
  if (!data) return null;

  const { price, rating, reviews, condition } = data;

  if (!DEAL_RULES.ALLOWED_CONDITIONS.includes(condition)) return null;
  if (price > regularPrice * DEAL_RULES.MAX_PRICE_MULTIPLIER) return null;

  const discountPercent = Math.round(
    ((regularPrice - price) / regularPrice) * 100
  );

  if (discountPercent < DEAL_RULES.MIN_DISCOUNT_PERCENT) return null;
  if (discountPercent > DEAL_RULES.MAX_DISCOUNT_PERCENT) return null;
  if (rating !== null && rating < DEAL_RULES.MIN_RATING) return null;
  if (reviews !== null && reviews < DEAL_RULES.MIN_REVIEWS) return null;

  return new Deal({
    id,
    title,
    currentPrice: price,
    regularPrice,
    discountPercent,
    retailer: "Amazon",
    url,
    manual: false,
    lastUpdated: new Date()
  });
}
