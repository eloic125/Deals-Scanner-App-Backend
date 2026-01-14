// src/services/userStore.js
import fs from "fs";
import path from "path";

/* =====================================================
   USER STORE (POINTS + LEVELS)
   - JSON-backed
   - Deterministic levels (derived from points)
   - Backward compatible
===================================================== */

const DATA_DIR = path.join(process.cwd(), "src", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BACKUP_FILE = `${USERS_FILE}.bak`;

/* =====================================================
   LEVEL CONFIG (SINGLE SOURCE)
===================================================== */

const LEVELS = [
  { level: 1, name: "New Member", minPoints: 0 },
  { level: 2, name: "Deal Hunter", minPoints: 100 },
  { level: 3, name: "Smart Saver", minPoints: 300 },
  { level: 4, name: "Elite Finder", minPoints: 600 },
  { level: 5, name: "Legendary Deals", minPoints: 1000 },
];

function computeLevel(points) {
  const p = Number(points) || 0;

  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (p >= lvl.minPoints) current = lvl;
  }

  const next = LEVELS.find((l) => l.minPoints > current.minPoints) || null;

  return {
    level: current.level,
    levelName: current.name,
    points: p,
    nextLevel: next
      ? {
          level: next.level,
          levelName: next.name,
          requiredPoints: next.minPoints,
          remainingPoints: Math.max(0, next.minPoints - p),
        }
      : null,
  };
}

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
          users: {},
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

    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      users:
        parsed && typeof parsed.users === "object" && parsed.users
          ? parsed.users
          : {},
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

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        users: store.users || {},
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
  const row = store.users[id] || { points: 0 };

  const points = Number(row.points) || 0;
  const levelInfo = computeLevel(points);

  return {
    id,
    points,
    level: levelInfo.level,
    levelName: levelInfo.levelName,
    nextLevel: levelInfo.nextLevel,
  };
}

export function addUserPoints(userId, points) {
  const id = String(userId || "").trim();
  const delta = Number(points);

  if (!id) return { ok: false, error: "userId is required" };
  if (!Number.isFinite(delta)) return { ok: false, error: "points must be a number" };

  const store = readStore();
  const now = new Date().toISOString();

  const existing = store.users[id] || {
    points: 0,
    createdAt: now,
  };

  const beforePoints = Number(existing.points) || 0;
  const afterPoints = Math.max(0, Math.floor(beforePoints + delta));

  store.users[id] = {
    points: afterPoints,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  writeStore(store);

  const beforeLevel = computeLevel(beforePoints);
  const afterLevel = computeLevel(afterPoints);

  return {
    ok: true,
    userId: id,
    added: delta,
    points: afterPoints,
    leveledUp: afterLevel.level > beforeLevel.level,
    level: afterLevel.level,
    levelName: afterLevel.levelName,
    nextLevel: afterLevel.nextLevel,
  };
}
