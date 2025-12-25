/**
 * DealScanner API client — Works with Base44 (Vite)
 * This version safely falls back to a hard-coded admin key
 * until environment variables are working.
 */

export type Deal = {
  id: string;
  title: string;
  price: number;
  url?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  retailer?: string;
  status?: string;
};

export type DealUpdate = Partial<Deal> & { id: string };

// ===============================
// CONFIG
// ===============================

const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ||
  "https://api.dealsscanner.ca";

/**
 * TEMPORARY:
 * We hard-code your admin key as a fallback.
 * Replace YOUR_REAL_ADMIN_KEY_HERE with your real key.
 * Later — we remove this once Base44 env variables work.
 */
const ADMIN_KEY: string =
  (import.meta as any).env?.VITE_ADMIN_KEY ||
  "hcRzysFkoLG9CNdpKmEe4AjYSx30MraP5UTQi8tl6WfJguOw";

// ===============================
// PUBLIC — GET DEALS
// ===============================

export async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch(`${API_BASE}/deals`);

  if (!res.ok) {
    throw new Error(`Failed to fetch deals (${res.status})`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : json.deals || [];
}

// ===============================
// ADMIN — CREATE DEAL
// ===============================

export async function createDeal(deal: Omit<Deal, "id">): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/deals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify(deal),
  });

  if (res.status === 403) throw new Error("Admin authorization required");

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create deal (${res.status}): ${text}`);
  }

  return res.json();
}

// ===============================
// ADMIN — UPDATE DEAL
// ===============================

export async function updateDeal(update: DealUpdate): Promise<any> {
  if (!update?.id) throw new Error("Missing deal id");

  const res = await fetch(
    `${API_BASE}/admin/deals/${encodeURIComponent(update.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify(update),
    }
  );

  if (res.status === 403) throw new Error("Admin authorization required");

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update deal (${res.status}): ${text}`);
  }

  return res.json();
}

// ===============================
// ADMIN — DELETE DEAL
// ===============================

export async function deleteDeal(id: string): Promise<boolean> {
  if (!id) throw new Error("Missing deal id");

  const res = await fetch(
    `${API_BASE}/admin/deals/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        "x-admin-key": ADMIN_KEY,
      },
    }
  );

  if (res.status === 403) throw new Error("Admin authorization required");

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to delete deal (${res.status}): ${text}`);
  }

  return true;
}
