// FILE: src/services/classifyDealCategory.js
// FULL UPDATED DROP-IN FILE
//
// FIXES:
// - Backend NO LONGER crashes if OPENAI_API_KEY is missing
// - OpenAI is OPTIONAL (safe on Render Free / no env)
// - Always returns a valid category
// - Keeps your ALLOWED list and JSON parsing
//
// BEHAVIOR:
// - If OPENAI_API_KEY is missing → returns "Other"
// - If OpenAI errors / bad JSON → returns "Other"
// - Backend ALWAYS boots

import OpenAI from "openai";

const API_KEY = process.env.OPENAI_API_KEY?.trim() || null;

// 🔒 Only create client if key exists
const client = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

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

export async function classifyDealCategory({ title, description }) {
  // 🧯 HARD FAILSAFE — NEVER CRASH BACKEND
  if (!client) {
    return "Other";
  }

  try {
    const prompt = `
Classify the product into one category.

Allowed categories:
${ALLOWED.join("\n")}

Product:
Title: ${title}
Description: ${description || ""}

Return ONLY JSON:
{ "category": "<category>" }
    `.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text =
      response?.output_text ||
      response?.output?.[0]?.content?.[0]?.text ||
      "{}";

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return "Other";
    }

    if (!ALLOWED.includes(data.category)) {
      return "Other";
    }

    return data.category;
  } catch (err) {
    console.error("Category classify failed:", err?.message || err);
    return "Other";
  }
}
