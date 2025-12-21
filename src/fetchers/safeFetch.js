import fetch from "node-fetch";
import { HTTP_CONFIG } from "../config/http.js";
import { delay } from "../config/delay.js";

export async function safeFetch(url) {
  await delay(HTTP_CONFIG.minDelayMs);

  try {
    const response = await fetch(url, {
      headers: HTTP_CONFIG.headers,
      timeout: HTTP_CONFIG.timeout
    });

    if (!response.ok) {
      console.warn("Fetch failed:", response.status, url);
      return null;
    }

    return response;
  } catch (err) {
    console.error("Fetch error:", err.message);
    return null;
  }
}
