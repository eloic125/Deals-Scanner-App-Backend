import path from "path";

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, "src", "data");
export const DEALS_FILE = path.join(DATA_DIR, "deals.json");
