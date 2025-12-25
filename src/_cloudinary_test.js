import "dotenv/config";
import { getProductImageUrl } from "./services/cloudinaryImage.js";

const asin = process.argv[2] || "B0765WXDJS";

const url = getProductImageUrl(asin);
console.log("ASIN:", asin);
console.log("Cloudinary URL:", url);
