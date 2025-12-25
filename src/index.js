import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.js";
import dealsRoutes from "./routes/deals.js";
import redirectRoutes from "./routes/redirect.js";
import adminRoutes from "./routes/admin.js";

const app = express();

/* =========================
   BOOT MARKER (DO NOT REMOVE)
========================= */
console.log("BOOT VERSION 2025-01-STABLE-PERSISTENT");

/* =========================
   SECURITY
========================= */
app.use(helmet());

/* =========================
   BODY PARSER (REQUIRED)
========================= */
app.use(express.json({ limit: "1mb" }));

/* =========================
   CORS (BASE44 + PROD + DEV)
========================= */
app.use(
  cors({
    origin: (origin, cb) => {
      // server-to-server (curl, internal, render)
      if (!origin) return cb(null, true);

      // production domains
      if (origin === "https://dealsscanner.ca") return cb(null, origin);
      if (origin === "https://www.dealsscanner.ca") return cb(null, origin);

      // Base44 editor
      if (origin === "https://app.base44.com") return cb(null, origin);

      // Base44 preview sandboxes (*.base44.app)
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".base44.app")) {
          return cb(null, origin);
        }
      } catch {}

      // local development
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return cb(null, origin);
      }

      return cb(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "x-admin-key",
      "Authorization",
      "X-Requested-With",
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

/* =========================
   PREFLIGHT (NODE 22 SAFE)
========================= */
app.options(/.*/, cors());

/* =========================
   ROUTES — ROOT
========================= */
app.use("/", healthRoutes);
app.use("/", dealsRoutes);
app.use("/", redirectRoutes);
app.use("/", adminRoutes);

/* =========================
   ROUTES — /api
========================= */
app.use("/api", healthRoutes);
app.use("/api", dealsRoutes);
app.use("/api", redirectRoutes);
app.use("/api", adminRoutes);

/* =========================
   ROUTES — /api/v1
========================= */
app.use("/api/v1", healthRoutes);
app.use("/api/v1", dealsRoutes);
app.use("/api/v1", redirectRoutes);
app.use("/api/v1", adminRoutes);

/* =========================
   CORS ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  if (err && err.message === "CORS blocked") {
    return res.status(403).json({ error: "CORS blocked" });
  }
  return next(err);
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
