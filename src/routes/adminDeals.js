/**
 * POST /admin/deals/:id/delete
 * DELETE ONE DEAL BY ID (COUNTRY-AWARE)
 */
router.post("/admin/deals/:id/delete", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const country =
    String(req.query.country || req.body.country || "CA").toUpperCase() === "US"
      ? "US"
      : "CA";

  // IMPORTANT: country-aware store
  const store = readDeals(country);
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const remaining = deals.filter((d) => d.id !== id);

  if (remaining.length === deals.length) {
    return res.status(404).json({ error: "Deal not found" });
  }

  // IMPORTANT: write back to same country store
  writeDeals(remaining, country);

  res.json({
    ok: true,
    deletedId: id,
    country,
  });
});
