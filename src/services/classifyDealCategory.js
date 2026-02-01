// FILE: src/services/classifyDealCategory.js
// FULL DROP-IN REPLACEMENT — NO OPENAI
//
// GUARANTEES:
// - Backend NEVER crashes
// - No OpenAI API
// - No billing
// - No env vars
// - Always returns one allowed category

const ALLOWED = [
  "Electronics",
  "Gaming",
  "Smart Home",
  "Computers",
  "Phones & Tablets",
  "Home & Kitchen",
  "Fitness",
  "Beauty",
  "Other",
];

function safeText(title, description) {
  const t = typeof title === "string" ? title : "";
  const d = typeof description === "string" ? description : "";
  return `${t} ${d}`.toLowerCase();
}

export async function classifyDealCategory({ title, description } = {}) {
  try {
    const text = safeText(title, description);

    if (!text.trim()) return "Other";

    if (text.includes("iphone") || text.includes("android") || text.includes("tablet") || text.includes("ipad")) {
      return "Phones & Tablets";
    }

    if (
      text.includes("laptop") ||
      text.includes("macbook") ||
      text.includes("pc ") ||
      text.includes("desktop") ||
      text.includes("computer")
    ) {
      return "Computers";
    }

    if (
      text.includes("console") ||
      text.includes("ps5") ||
      text.includes("playstation") ||
      text.includes("xbox") ||
      text.includes("nintendo") ||
      text.includes("switch") ||
      text.includes("gaming")
    ) {
      return "Gaming";
    }

    if (
      text.includes("alexa") ||
      text.includes("echo") ||
      text.includes("smart home") ||
      text.includes("google home") ||
      text.includes("nest") ||
      text.includes("smart plug") ||
      text.includes("smart bulb")
    ) {
      return "Smart Home";
    }

    if (
      text.includes("kitchen") ||
      text.includes("cook") ||
      text.includes("air fryer") ||
      text.includes("blender") ||
      text.includes("microwave") ||
      text.includes("vacuum") ||
      text.includes("roomba")
    ) {
      return "Home & Kitchen";
    }

    if (
      text.includes("fitness") ||
      text.includes("gym") ||
      text.includes("workout") ||
      text.includes("treadmill") ||
      text.includes("dumbbell") ||
      text.includes("protein")
    ) {
      return "Fitness";
    }

    if (
      text.includes("beauty") ||
      text.includes("skincare") ||
      text.includes("makeup") ||
      text.includes("serum") ||
      text.includes("moisturizer") ||
      text.includes("shampoo")
    ) {
      return "Beauty";
    }

    if (
      text.includes("tv") ||
      text.includes("headphones") ||
      text.includes("earbuds") ||
      text.includes("camera") ||
      text.includes("speaker") ||
      text.includes("monitor")
    ) {
      return "Electronics";
    }

    const result = "Other";
    return ALLOWED.includes(result) ? result : "Other";
  } catch (err) {
    console.error("classifyDealCategory failed:", err?.message || err);
    return "Other";
  }
}
