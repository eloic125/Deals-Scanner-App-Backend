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
      "x-country",
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

/* =====================================================
   EBAY CLICK PROXY — HARD PROOF + AFFILIATE REDIRECT
   WORKS ON /, /api, /api/v1
===================================================== */
function ebayClickProxy(req, res) {
  const { itemId } = req.params;
  const country = req.query.country === "US" ? "US" : "CA";

  const affiliateUrl =
    country === "US"
      ? `https://www.ebay.com/itm/${itemId}?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339134577&customid=dealsscanner`
      : `https://www.ebay.ca/itm/${itemId}?mkevt=1&mkcid=1&mkrid=706-53473-19255-0&campid=5339134577&customid=dealsscanner`;

  // 🔥 HARD PROOF LOG (SERVER-SIDE)
  console.log("EBAY_CLICK_PROXY", {
    itemId,
    country,
    ip:
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress,
    ua: req.headers["user-agent"],
    time: new Date().toISOString(),
    affiliateUrl,
  });

  return res.redirect(302, affiliateUrl);
}

/* =========================
   ROUTES — ROOT
========================= */
app.use("/", healthRoutes);
app.use("/", dealsRoutes);
app.use("/", redirectRoutes);
app.use("/", alertsRoutes);
app.use("/", usersRoutes);
app.use("/", adminRoutes);

app.get("/go/ebay/:itemId", ebayClickProxy);

/* =========================
   ROUTES — /api
========================= */
app.use("/api", healthRoutes);
app.use("/api", dealsRoutes);
app.use("/api", redirectRoutes);
app.use("/api", alertsRoutes);
app.use("/api", usersRoutes);
app.use("/api", adminRoutes);

app.get("/api/go/ebay/:itemId", ebayClickProxy);

/* =========================
   ROUTES — /api/v1
========================= */
app.use("/api/v1", healthRoutes);
app.use("/api/v1", dealsRoutes);
app.use("/api/v1", redirectRoutes);
app.use("/api/v1", alertsRoutes);
app.use("/api/v1", usersRoutes);
app.use("/api/v1", adminRoutes);

app.get("/api/v1/go/ebay/:itemId", ebayClickProxy);

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
