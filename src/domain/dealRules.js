export const DEAL_RULES = {
  // Minimum discount to be considered a deal
  MIN_DISCOUNT_PERCENT: 25,

  // Reject obvious fake / glitch discounts
  MAX_DISCOUNT_PERCENT: 85,

  // Product quality thresholds
  MIN_REVIEWS: 100,
  MIN_RATING: 3.8,

  // Sanity guard: price must not exceed this multiplier
  MAX_PRICE_MULTIPLIER: 1.2,

  // Only allow brand-new items
  ALLOWED_CONDITIONS: ["new"]
};
