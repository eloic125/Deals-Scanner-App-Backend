import fetch from "node-fetch";
import { JSDOM } from "jsdom";

export async function collectPrice(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const html = await response.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Temporary selector — we’ll refine later
  const priceEl = document.querySelector("span");

  if (!priceEl) {
    throw new Error("Price not found");
  }

  const raw = priceEl.textContent;
  const price = parseFloat(raw.replace(/[^0-9.]/g, ""));

  return {
    price,
    checkedAt: new Date().toISOString()
  };
}
