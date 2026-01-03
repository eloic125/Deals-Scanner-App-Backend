import express from "express";
import crypto from "node:crypto";
import { readDeals, writeDeals } from "../services/dealStore.js";

const router = express.Router();

/* =====================================
   HELPERS
===================================== */

function ensureAlerts(store) {
  if (!Array.isArray(store.alerts)) {
    store.alerts = [];
  }
  return store;
}

/*
Alert format:

{
  id: "uuid",
  userId: "123",
  dealId: "abc",
  targetPrice: 25.99,
  createdAt: "...",
  triggeredAt: null,
  active: true
}

*/

/* =====================================
   CREATE ALERT
   POST /alerts
===================================== */

router.post("/alerts", (req, res) => {
  const body = req.body || {};
  const store = ensureAlerts(readDeals());

  const userId = req.user?.id || body.userId || null;
  const dealId = String(body.dealId || body.deal_id || "").trim();
  const targetPrice = Number(body.targetPrice);

  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }

  if (!dealId || !Number.isFinite(targetPrice)) {
    return res
      .status(400)
      .json({ error: "dealId and targetPrice are required" });
  }

  const deal = (store.deals || []).find((d) => d.id === dealId);
  if (!deal) {
    return res.status(404).json({ error: "Deal not found" });
  }

  // Prevent duplicates from the same user for the same deal
  const already = store.alerts.find(
    (a) => a.userId === userId && a.dealId === dealId && a.active
  );

  if (already) {
    return res
      .status(400)
      .json({ error: "Alert already exists for this deal" });
  }

  const alert = {
    id: crypto.randomUUID(),
    userId,
    dealId,
    targetPrice,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    active: true
  };

  store.alerts.push(alert);
  writeDeals(store);

  res.json({ ok: true, alert });
});

/* =====================================
   LIST USER ALERTS
   GET /alerts
===================================== */

router.get("/alerts", (req, res) => {
  const store = ensureAlerts(readDeals());

  const userId = req.user?.id || null;
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }

  const alerts = store.alerts.filter((a) => a.userId === userId);

  res.json({ ok: true, alerts });
});

/* =====================================
   DELETE ALERT
   DELETE /alerts/:id
===================================== */

router.delete("/alerts/:id", (req, res) => {
  const store = ensureAlerts(readDeals());
  const userId = req.user?.id || null;

  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }

  const { id } = req.params;

  const idx = store.alerts.findIndex(
    (a) => a.id === id && a.userId === userId
  );

  if (idx === -1) {
    return res.status(404).json({ error: "Alert not found" });
  }

  store.alerts.splice(idx, 1);
  writeDeals(store);

  res.json({ ok: true });
});

export default router;
