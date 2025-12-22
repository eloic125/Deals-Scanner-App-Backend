import "dotenv/config";
import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.js";
import dealsRoutes from "./routes/deals.js";
import redirectRoutes from "./routes/redirect.js";
import adminRoutes from "./routes/admin.js";

const app = express();

/**
 * CORS allowlist
 * - Production: strict allowlist from CORS_ORIGINS (comma-separated)
 * - Development: allow localhost origins
 *
 * IMPORTANT: We return the exact origin string when allowed.
 * This prevents access-control-allow-origin: * in production.
 */
const parseCorsOrigins = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const ALLOWED_ORIGINS = parseCorsOrigins(process.env.CORS_ORIGINS);
const isProd = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: (origin, cb) => {
      // If no Origin header, do NOT set CORS headers (server-to-server / PowerShell / curl without Origin)
      if (!origin) return cb(null, false);

      // Dev: allow localhost
      if (!isProd) {
        if (
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return cb(null, origin); // echo origin
        }
      }

      // Prod (and also works in dev): strict allowlist
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, origin); // echo origin

      return cb(new Error("CORS blocked: origin not allowed"));
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key"],
    optionsSuccessStatus: 204,
  })
);

// Body size limit (abuse hardening)
app.use(express.json({ limit: "100kb" }));

// Routes
app.use("/", healthRoutes);
app.use("/", dealsRoutes);
app.use("/", redirectRoutes);
app.use("/", adminRoutes);

// Clean CORS errors (avoid leaking stack traces)
app.use((err, req, res, next) => {
  if (err && err.message === "CORS blocked: origin not allowed") {
    return res.status(403).json({ error: "CORS blocked: origin not allowed" });
  }
  return next(err);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("NODE_ENV =", process.env.NODE_ENV);
  console.log("CORS_ORIGINS =", process.env.CORS_ORIGINS);
});
