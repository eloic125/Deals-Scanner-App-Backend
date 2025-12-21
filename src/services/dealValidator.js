/**
 * Validate a deal object
 * Returns: { isValid, errors }
 */
export function validateDeal(deal) {
  const errors = [];

  if (!deal || typeof deal !== "object") {
    return { isValid: false, errors: ["Deal is not an object"] };
  }

  if (!deal.title || typeof deal.title !== "string") {
    errors.push("Missing or invalid title");
  }

  if (!deal.price || typeof deal.price !== "number" || deal.price <= 0) {
    errors.push("Invalid price");
  }

  if (!deal.url || typeof deal.url !== "string") {
    errors.push("Missing or invalid url");
  }

  if (deal.inStock === false) {
    errors.push("Out of stock");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
