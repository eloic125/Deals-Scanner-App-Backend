export function getProductImageUrl(asin) {
  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/products/${asin}`;
}
