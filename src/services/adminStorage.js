import fs from "fs";
import path from "path";

const FILE_PATH = path.resolve("src/data/adminProducts.json");

export function loadAdminProducts() {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAdminProducts(products) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(products, null, 2));
}
