import { Router } from "express";
import { cacheStatus } from "../cache/dealsCache.js";

const router = Router();

// Health check
router.get("/", (req, res) => {
  res.json({ message: "DealSignal backend is running!" });
});

// Cache debug (safe, read-only)
router.get("/cache", (req, res) => {
  res.json(cacheStatus());
});

export default router;
