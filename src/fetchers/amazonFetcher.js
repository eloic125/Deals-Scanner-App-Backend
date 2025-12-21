import { JSDOM } from "jsdom";
import { safeFetch } from "./safeFetch.js";

function isBotPage(html) {
  return (
    html.includes("captcha") ||
    html.includes("robot check") ||
    html.includes("Enter the characters you see")
  );
}

export async function fetchAmazonData(productUrl) {
  const response = await safeFetch(productUrl);
  if (!response || !response.ok) return null;

  const html = await response.text();
  if (!html || isBotPage(html)) return null;

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const priceEl =
    document.querySelector("#priceblock_dealprice") ||
    document.querySelector("#priceblock_ourprice") ||
    document.querySelector("#priceblock_saleprice");

  let price = null;
  if (priceEl) {
    const parsed = parseFloat(
      priceEl.textContent.replace(/[^0-9.]/g, "")
    );
    if (!isNaN(parsed)) price = parsed;
  }

  const ratingEl = document.querySelector("span.a-icon-alt");
  const rating = ratingEl ? parseFloat(ratingEl.textContent) : null;

  const reviewEl = document.querySelector("#acrCustomerReviewText");
  const reviews = reviewEl
    ? parseInt(reviewEl.textContent.replace(/[^0-9]/g, ""))
    : null;

  return { price, rating, reviews };
}
