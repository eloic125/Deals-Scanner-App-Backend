export class Deal {
  constructor({
    id,
    title,
    currentPrice,
    regularPrice = null,
    discountPercent = null,
    retailer,
    url,
    manual = false,
    verified = false,
    rating = null,
    reviews = null,
    lastUpdated = new Date()
  }) {
    this.id = id;
    this.title = title;
    this.currentPrice = currentPrice;
    this.regularPrice = regularPrice;
    this.discountPercent = discountPercent;
    this.retailer = retailer;
    this.url = url;
    this.manual = manual;
    this.verified = verified;
    this.rating = rating;
    this.reviews = reviews;
    this.lastUpdated = lastUpdated;
  }
}
