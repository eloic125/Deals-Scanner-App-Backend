/**
 * Fetch deals from backend API
 */

const API_BASE = "http://localhost:3000";

export async function fetchDeals() {
  const response = await fetch(`${API_BASE}/deals`);

  if (!response.ok) {
    throw new Error("Failed to fetch deals");
  }

  return response.json();
}
