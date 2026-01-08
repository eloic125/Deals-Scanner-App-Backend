// src/services/userStore.js
import fs from "fs";
import path from "path";

/* =====================================================
   USER STORE (POINTS ONLY)
   - Minimal, safe JSON store
   - Auto-creates file on first use
===================================================== */

const DATA_DIR = path.join(process.cwd(), "src", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BACKUP_FILE = `${USERS_FILE}.bak`;

/* =====================================================
   INIT
===================================================== */

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          users: {}, // { [userId]: { points: number, updatedAt: string, createdAt: string } }
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

/* =====================================================
   READ / WRITE
===================================================== */

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");

    const users =
      parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object"
        ? parsed.users
        : {};

    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      users,
    };
  } catch (err) {
    console.warn("userStore read failed, resetting:", err?.message || err);
    return { updatedAt: new Date().toISOString(), users: {} };
  }
}

function backupFile() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      fs.copyFileSync(USERS_FILE, BACKUP_FILE);
    }
  } catch (err) {
    console.warn("userStore backup failed:", err?.message || err);
  }
}

function writeStore(store) {
  ensureStore();
  backupFile();

  const safeUsers =
    store && typeof store === "object" && store.users && typeof store.users === "object"
      ? store.users
      : {};

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        users: safeUsers,
      },
      null,
      2
    ),
    "utf8"
  );
}

/* =====================================================
   PUBLIC API
===================================================== */

export function getUser(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;

  const store = readStore();
  const row = store.users[id];
  if (!row) return { id, points: 0 };

  return {
    id,
    points: Number(row.points) || 0,
  };
}

export function addUserPoints(userId, points) {
  const id = String(userId || "").trim();
  const delta = Number(points);

  if (!id) return { ok: false, error: "userId is required" };
  if (!Number.isFinite(delta)) return { ok: false, error: "points must be a number" };

  const store = readStore();

  const now = new Date().toISOString();
  const existing = store.users[id] || { points: 0, createdAt: now };

  const currentPoints = Number(existing.points) || 0;
  const nextPoints = Math.max(0, Math.floor(currentPoints + delta));

  store.users[id] = {
    points: nextPoints,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  writeStore(store);

  return { ok: true, userId: id, points: nextPoints, added: delta };
}
