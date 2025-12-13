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
  },
  {
    id: "mock_3",
    title: "Nintendo Switch OLED",
    price: 399.99,
    retailer: "Amazon",
    link: "https://www.amazon.ca"
  },
  {
    id: "mock_4",
    title: "PlayStation 5",
    price: 649.99,
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

// Featured deals (2x2 grid)
app.get("/featured", (req, res) => {
  res.json(products.slice(0, 4));
});

// 🔥 Search + pagination + sorting
app.get("/search", (req, res) => {
  const query = (req.query.query || "").toLowerCase();

  // pagination
  const page = parseInt(req.query.page || "1");
  const limit = parseInt(req.query.limit || "4");
  const start = (page - 1) * limit;
  const end = start + limit;

  // sorting
  const sort = req.query.sort || "price_asc";

  let results = products.filter(p =>
    p.title.toLowerCase().includes(query)
  );

  if (sort === "price_asc") {
    results.sort((a, b) => a.price - b.price);
  }

  if (sort === "price_desc") {
    results.sort((a, b) => b.price - a.price);
  }

  if (sort === "name") {
    results.sort((a, b) => a.title.localeCompare(b.title));
  }

  const paginatedResults = results.slice(start, end);

  res.json({
    query,
    page,
    limit,
    totalResults: results.length,
    totalPages: Math.ceil(results.length / limit),
    results: paginatedResults
  });
});

// Redirect + tracking (MOST IMPORTANT)
app.get("/redirect", (req, res) => {
  const { id } = req.query;

  const product = products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  trackClick({
    productId: product.id,
    retailer: product.retailer
  });

  res.redirect(product.link);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port " + PORT)
);
