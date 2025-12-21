import { featuredProducts } from "../data/featuredProducts.js";
import { buildAmazonDeal, buildEbayDeal } from "./dealBuilder.js";

export async function getFeaturedDeals() {
  const results = [];

  for (const product of featuredProducts) {
    try {
      let deal = null;

      // 🔒 HARD ROUTING — NO FALLTHROUGH POSSIBLE
      if (product.retailer === "amazon") {
        deal = await buildAmazonDeal({
          id: product.asin,
          title: product.asin,
          url: `https://www.amazon.ca/dp/${product.asin}`,
          forceInclude: product.forceInclude
        });
      } else if (product.retailer === "ebay") {
        deal = await buildEbayDeal({
          id: product.itemId,
          title: product.itemId,
          url: `https://www.ebay.com/itm/${product.itemId}`,
          forceInclude: product.forceInclude
        });
      } else {
        continue;
      }

      if (deal) results.push(deal);
    } catch (err) {
      console.error("[FEATURED] Failed:", err.message);
    }
  }

  return results;
}
