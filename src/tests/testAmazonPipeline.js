import { buildAmazonDeal } from "../services/dealBuilder.js";

async function runTest() {
  console.log("=== AMAZON DEAL PIPELINE TEST ===");

  const deal = await buildAmazonDeal({
    id: "test_watch",
    title: "Smart Watch",
    url: "https://www.amazon.ca/dp/B0G2L8MWRM",
    regularPrice: 129.99,
    expectedKeywords: ["smart", "watch"]
  });

  if (!deal) {
    console.log("❌ Not a deal or price not detected");
    return;
  }

  console.log("✅ DEAL FOUND");
  console.log({
    title: deal.title,
    price: deal.currentPrice,
    discount: deal.discountPercent,
    link: deal.url
  });
}

runTest();
