// FILE: src/services/classifyDealCategory.js
// FULL DROP-IN REPLACEMENT — NO OPENAI
//
// GUARANTEES:
// - Backend NEVER crashes
// - No OpenAI API
// - No billing
// - No env vars
// - Categories ALWAYS return
//
// RULE:
// - This app does NOT depend on AI to function

const ALLOWED = [
  "Electronics",
  "Gaming",
  "Smart Home",
  "Computers",
  "Phones & Tablets",
  "Home & Kitchen",
  "Fitness",
  "Beauty",
  "Other"
];

// Simple keyword-based fallback classifier (FREE + SAFE)
export async function classifyDealCategory({ title, description }) {
  const text = `${title} ${description || ""}`.toLowerCase();

  if (text.includes("iphone") || text.includes("android") || text.includes("tablet")) {
    return "Phones & Tablets";
  }

  if (text.includes("laptop") || text.includes("pc") || text.includes("computer")) {
    return "Computers";
  }

  if (text.includes("console") || text.includes("ps5") || text.includes("xbox") || text.includes("gaming")) {
    return "Gaming";
  }

  if (text.includes("alexa") || text.includes("smart") || text.includes("google home")) {
    return "Smart Home";
  }

  if (text.includes("kitchen") || text.includes("cook") || text.includes("vacuum")) {
    return "Home & Kitchen";
  }

  if (text.includes("fitness") || text.includes("gym") || text.includes("workout")) {
    return "Fitness";
  }

  if (text.includes("beauty") || text.includes("skincare") || text.includes("makeup")) {
    return "Beauty";
  }

  if (text.includes("tv") || text.includes("headphones") || text.includes("camera")) {
    return "Electronics";
  }

  return "Other";
}
