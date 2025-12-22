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
   SECURITY
========================= */
app.use(helmet());

/* =========================
   CORS (SINGLE SOURCE OF TRUTH)
========================= */
app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl
      if (!origin) return cb(null, true);

      // production domains
      if (origin === "https://dealsscanner.ca") return cb(null, origin);
      if (origin === "https://www.dealsscanner.ca") return cb(null, origin);

      // Base44 editor + previews
      if (origin === "https://app.base44.com") return cb(null, origin);
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".base44.app")) return cb(null, origin);
      } catch {}

      // local dev
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return cb(null, origin);
      }

      return cb(new Error("CORS blocked: origin not allowed"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
   BODY PARSER
========================= */
app.use(express.json({ limit: "100kb" }));

/* =========================
   ROUTES (ROOT)
========================= */
app.use("/", healthRoutes);
app.use("/", dealsRoutes);
app.use("/", redirectRoutes);
app.use("/", adminRoutes);

/* =========================
   ROUTES (/api)
========================= */
app.use("/api", healthRoutes);
app.use("/api", dealsRoutes);
app.use("/api", redirectRoutes);
app.use("/api", adminRoutes);

/* =========================
   ROUTES (/api/v1)
========================= */
app.use("/api/v1", healthRoutes);
app.use("/api/v1", dealsRoutes);
app.use("/api/v1", redirectRoutes);
app.use("/api/v1", adminRoutes);

/* =========================
   CORS ERROR CLEANUP
========================= */
app.use((err, req, res, next) => {
  if (err && err.message === "CORS blocked: origin not allowed") {
    return res.status(403).json({ error: "CORS blocked: origin not allowed" });
  }
  return next(err);
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
