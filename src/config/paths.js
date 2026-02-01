// FILE: src/config/paths.js
// FULL FILE — DROP-IN REPLACEMENT
//
// RENDER STORAGE RULE (AUTO):
// - If a Render Disk is mounted at /var/dealsignal (paid), use it.
// - Otherwise, use /tmp/dealsignal (free / ephemeral).
//
// This prevents:
// - EACCES permission denied mkdir '/var/dealsignal' (on free)
// - Losing deals by accidentally pointing to /tmp when disk exists
//
// IMPORTANT:
// - /tmp is wiped on restarts.
// - /var/dealsignal persists only when disk is attached and plan is paid.

import fs from "fs";
import path from "path";

export const ROOT_DIR = process.cwd();

// Preferred persistent mount (paid disk)
const PERSIST_DIR = "/var/dealsignal";
// Safe writable fallback (free)
const TMP_DIR = "/tmp/dealsignal";

// Detect if persistent disk is actually available/writable
function pickDataDir() {
  try {
    // If the directory exists OR can be created, try writing a tiny temp file.
    fs.mkdirSync(PERSIST_DIR, { recursive: true });

    const testFile = path.join(PERSIST_DIR, ".write_test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);

    return PERSIST_DIR;
  } catch {
    // Fall back to /tmp
    try {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    } catch {}
    return TMP_DIR;
  }
}

export const DATA_DIR = pickDataDir();

// Base deals file (country-specific files are derived from this)
export const DEALS_FILE = path.join(DATA_DIR, "deals.json");

// Optional: log once so you can SEE which path is active on Render
console.log("🗂️ DATA_DIR selected:", DATA_DIR);
console.log("💾 DEALS_FILE:", DEALS_FILE);
