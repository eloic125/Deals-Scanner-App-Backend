import path from "path";

export const ROOT_DIR = process.cwd();

// Match the actual Render disk mount path
export const DATA_DIR = "/var/dealsignal";

export const DEALS_FILE = path.join(DATA_DIR, "deals.json");
