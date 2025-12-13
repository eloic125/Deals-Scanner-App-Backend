import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ======================
   MOCK DATA (temporary)
   ====================== */
const products = [
  {
    id: "mock_1",
    title: "AirPods Pro 2",
    price: 189.99,
    retailer: "Amazon",
    link: "https://www.amazon.ca"
  },
  {
    id: "mock_2",
    title: "Sony WH-1000XM5",
    price: 278.00,
    retailer: "Walmart",
    link: "https://www.walmart.ca"
  }
];

/* ======================
   CLICK TRACKING
   ====================== */
function trackClick({ productId, retailer }) {
  console.log("CLICK_TRACKED", {
    productId,
    retailer,
    timestamp: new Date().toISOString()
  });
}

/* ======================
   ROUTES
   ====================== */

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Deal AI Backend is running!" });
});

// Featured deals (for 2x2 grid)
app.get("/featured", (req, res) => {
  res.json(products);
});

// Search route (mock logic)
app.get("/search", (req, res) => {
  const query = (req.query.query || "").toLowerCase();

  const results = products.filter(p =>
    p.title.toLowerCase().includes(query)
  );

  res.json({
    query,
    results
  });
});

// Redirect + tracking (MOST IMPORTANT)
app.get("/redirect", (req, res) => {
  const { id } = req.query;

  const product = products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Track click before redirect
  trackClick({
    productId: product.id,
    retailer: product.retailer
  });

  // Redirect user
  res.redirect(product.link);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port " + PORT)
);
