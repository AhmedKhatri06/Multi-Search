import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary(query, sources) {
  try {
    if (!query || !sources || sources.length === 0) {
      console.warn("AI summary skipped: insufficient data");
      return null;
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const facts = sources.slice(0, 5).map(s =>
      `• ${s.title || s.text || "Unknown"} (${s.source || "source"})`
    ).join("\n");

    const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
${query}

Facts:
${facts}

Write a factual, neutral summary in 3–4 sentences.
`;

    const result = await model.generateContent(prompt);

    // 🔴 SAFE EXTRACTION (THIS IS THE KEY)
    const response = result?.response;

// ✅ Preferred helper (Gemini SDK)
if (typeof response?.text === "function") {
  const text = response.text().trim();
  if (text) return text;
}

// ✅ Fallback: manual parts merge
const parts = response?.candidates?.[0]?.content?.parts;
if (Array.isArray(parts)) {
  const text = parts
    .map(p => p.text)
    .filter(Boolean)
    .join(" ")
    .trim();

  if (text) return text;
}

console.error("Gemini returned no usable text");
return null;


    return text;

  } catch (err) {
    console.error("Gemini summary error:", err.message);
    return null;
  }
}
