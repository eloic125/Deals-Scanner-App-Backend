import { Router } from "express";
import { cacheStatus } from "../cache/dealsCache.js";

const router = Router();

// Root (nice for humans)
router.get("/", (req, res) => {
  res.json({ message: "DealSignal backend is running!" });
});

// Health check (for Render / monitors)
router.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// Cache debug (safe, read-only)
router.get("/cache", (req, res) => {
  res.json(cacheStatus());
});

export default router;
