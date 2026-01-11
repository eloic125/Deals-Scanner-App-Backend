import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.js";
import dealsRoutes from "./routes/deals.js";
import redirectRoutes from "./routes/redirect.js";
import alertsRoutes from "./routes/alerts.js";
import usersRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js"; // ✅ REQUIRED

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
   USER IDENTITY MIDDLEWARE
   (EMAIL VIA HEADER)
========================= */
app.use((req, res, next) => {
  const email = String(req.headers["x-user-email"] || "")
    .trim()
    .toLowerCase();

  if (email) {
    req.user = { id: email };
  } else {
    req.user = null;
  }

  next();
});

/* =========================
   CORS (BASE44 + PROD + DEV)
========================= */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (origin === "https://dealsscanner.ca") return cb(null, origin);
      if (origin === "https://www.dealsscanner.ca") return cb(null, origin);
      if (origin === "https://app.base44.com") return cb(null, origin);

      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".base44.app")) {
          return cb(null, origin);
        }
      } catch {}

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
      "x-user-email",
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
app.use("/", alertsRoutes);
app.use("/", usersRoutes);
app.use("/", adminRoutes); // ✅ ADMIN ROUTES LIVE

/* =========================
   ROUTES — /api
========================= */
app.use("/api", healthRoutes);
app.use("/api", dealsRoutes);
app.use("/api", redirectRoutes);
app.use("/api", alertsRoutes);
app.use("/api", usersRoutes);
app.use("/api", adminRoutes); // ✅ ADMIN ROUTES LIVE

/* =========================
   ROUTES — /api/v1
========================= */
app.use("/api/v1", healthRoutes);
app.use("/api/v1", dealsRoutes);
app.use("/api/v1", redirectRoutes);
app.use("/api/v1", alertsRoutes);
app.use("/api/v1", usersRoutes);
app.use("/api/v1", adminRoutes); // ✅ ADMIN ROUTES LIVE

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
