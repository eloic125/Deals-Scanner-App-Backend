/**
 * DEALS API — FINAL, STABLE, FULL VERSION
 * ---------------------------------------
 * Works with:
 * https://api.dealsscanner.ca
 *
 * IMPORTANT:
 * VITE_API_BASE MUST NOT contain `/api`
 *
 * Example:
 * VITE_API_BASE=https://api.dealsscanner.ca
 */

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://api.dealsscanner.ca";

const ADMIN_KEY =
  import.meta.env.VITE_ADMIN_KEY ||
  "hcRzysFkoLG9CNdpKmEe4AjYSx30MraP5UTQi8tl6WfJguOw";

/* ======================================================
   PUBLIC — FETCH LIST
====================================================== */

export async function fetchDeals({
  limit = 50,
  offset = 0,
  sort = "newest",
  category = "All",
} = {}) {
  const params = new URLSearchParams({
    limit,
    offset,
    sort,
    category,
  });

  const res = await fetch(`${API_BASE}/deals?${params.toString()}`);

  if (!res.ok)
    throw new Error(`Failed to fetch deals (${res.status})`);

  const json = await res.json();

  return Array.isArray(json?.deals) ? json.deals : [];
}

/* ======================================================
   PUBLIC — FETCH SINGLE
====================================================== */

export async function fetchDealById(id) {
  const res = await fetch(`${API_BASE}/deals/${encodeURIComponent(id)}`);

  if (!res.ok)
    throw new Error(`Failed to fetch deal (${res.status})`);

  return res.json();
}

/* ======================================================
   ADMIN — CREATE
====================================================== */

export async function createDeal(deal) {
  const payload = {
    title: deal.title,
    price: Number(deal.price),
    originalPrice: deal.originalPrice
      ? Number(deal.originalPrice)
      : null,
    retailer: deal.retailer || "Amazon",
    category: deal.category || "Other",
    imageUrl: deal.imageUrl || "",
    url: deal.url || "",
    notes: deal.notes || "",
    status: deal.status || "approved",
  };

  const res = await fetch(`${API_BASE}/admin/deals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create failed (${res.status}): ${text}`);
  }

  return res.json();
}

/* ======================================================
   ADMIN — UPDATE
====================================================== */

export async function updateDeal(id, data) {
  const res = await fetch(`${API_BASE}/admin/deals/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update deal (${res.status}): ${text}`);
  }

  return res.json();
}

/* ======================================================
   ADMIN — DELETE
====================================================== */

export async function deleteDeal(id) {
  const res = await fetch(`${API_BASE}/admin/deals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "x-admin-key": ADMIN_KEY,
    },
  });

  if (!res.ok)
    throw new Error(`Failed to delete (${res.status})`);

  return true;
}
