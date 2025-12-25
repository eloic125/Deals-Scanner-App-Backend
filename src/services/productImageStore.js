import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("src/data");
const FILE_PATH = path.join(DATA_DIR, "productImages.json");

/* =========================
   FILE SAFETY
========================= */

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify(
        {
          imagesByKey: {}
        },
        null,
        2
      )
    );
  }
}

/* =========================
   READ / WRITE
========================= */

export function readProductImages() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch {
    return { imagesByKey: {} };
  }
}

export function writeProductImages(data) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

/* =========================
   PRODUCT KEY (CRITICAL FIX)
========================= */

/**
 * Create a collision-safe product key
 * - Amazon → ASIN-based key
 * - Other sites → hostname + pathname
 */
export function productKeyFromUrl(url) {
  try {
    const u = new URL(url);

    // AMAZON: extract ASIN
    if (u.hostname.includes("amazon.")) {
      const asinMatch = u.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `amazon:${asinMatch[1].toUpperCase()}`;
      }
    }

    // fallback (non-amazon)
    return `${u.hostname}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/* =========================
   CACHE ACCESS
========================= */

export function getCachedImage(url) {
  const key = productKeyFromUrl(url);
  if (!key) return null;

  const store = readProductImages();
  return store.imagesByKey[key] || null;
}

export function saveCachedImage({ url, imageUrl, imageType }) {
  const key = productKeyFromUrl(url);
  if (!key || !imageUrl) return;

  const store = readProductImages();
  const now = new Date().toISOString();

  store.imagesByKey[key] = {
    imageUrl,
    imageType: imageType || "remote",
    sourceUrl: url,
    updatedAt: now,
    createdAt: store.imagesByKey[key]?.createdAt || now
  };

  writeProductImages(store);
}
