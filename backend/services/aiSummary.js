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
    const candidates = response?.candidates;

    if (!candidates || !candidates.length) {
      console.error("Gemini returned no candidates");
      return null;
    }

    const text =
      candidates[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      console.error("Gemini returned empty text");
      return null;
    }

    return text;

  } catch (err) {
    console.error("Gemini summary error:", err.message);
    return null;
  }
}
