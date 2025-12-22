/**
 * POST /admin/deals/:id/delete
 * DELETE ONE DEAL BY ID
 */
router.post("/admin/deals/:id/delete", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  const store = readDeals();
  const deals = Array.isArray(store.deals) ? store.deals : [];

  const remaining = deals.filter(d => d.id !== id);

  if (remaining.length === deals.length) {
    return res.status(404).json({ error: "Deal not found" });
  }

  writeDeals(remaining);

  res.json({ ok: true, deletedId: id });
});
