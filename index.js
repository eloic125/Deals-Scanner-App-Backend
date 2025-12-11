import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.json({ message: "Deal AI Backend is running!" });
});

// Simple search route
app.get("/search", (req, res) => {
  const query = req.query.query || "";
  res.json({
    query,
    results: [
      { store: "Amazon", price: 199.99 },
      { store: "Walmart", price: 189.99 }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
