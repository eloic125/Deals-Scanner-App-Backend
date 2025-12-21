const clicks = [];

export function trackClick({ id, retailer }) {
  clicks.push({
    id,
    retailer,
    timestamp: new Date()
  });
}

export function getClicks() {
  return clicks;
}
