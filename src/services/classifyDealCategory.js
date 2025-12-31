import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    `;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text = response.output_text || "{}";
    const data = JSON.parse(text);

    if (!ALLOWED.includes(data.category)) {
      return "Other";
    }

    return data.category;
  } catch (err) {
    console.error("Category classify failed", err);
    return "Other";
  }
}
