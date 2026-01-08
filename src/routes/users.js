// src/routes/users.js
import express from "express";
import fs from "fs";
import path from "path";
import { getUser } from "../services/userStore.js";

const router = express.Router();

/* =====================================================
   GET MY POINTS
===================================================== */

router.get("/users/me/points", (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = getUser(userId);

  return res.json({
    ok: true,
    userId: user.id,
    points: user.points,
  });
});

/* =====================================================
   LEADERBOARD — TOP USERS BY POINTS
   - Reads src/data/users.json
   - Returns users sorted by points DESC
   - Default limit=25, max=100
===================================================== */

router.get("/leaderboard", (req, res) => {
  try {
    const DATA_DIR = path.join(process.cwd(), "src", "data");
    const USERS_FILE = path.join(DATA_DIR, "users.json");

    if (!fs.existsSync(USERS_FILE)) {
      return res.json({ ok: true, users: [] });
    }

    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");

    const usersObj =
      parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object"
        ? parsed.users
        : {};

    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));

    const users = Object.entries(usersObj)
      .map(([id, row]) => ({
        userId: id,
        points: Number(row?.points) || 0,
      }))
      .filter((u) => u.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);

    return res.json({
      ok: true,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      count: users.length,
      users,
    });
  } catch (err) {
    console.error("leaderboard failed:", err);
    return res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

export default router;
