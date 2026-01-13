import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary({ query, sources }) {
  try {
    if (!sources || sources.length === 0) return null;

    // Combine source text safely (limit size)
    const combinedText = sources
  .map(s => s?.content)
  .filter(Boolean)
  .join("\n")
  .slice(0, 6000);


    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const prompt = `
You are an AI research assistant.

Task:
Generate a concise, factual summary for "${query}" using ONLY the information below.

Rules:
- No assumptions
- No hallucinations
- Neutral tone
- 4–6 sentences max

Information:
${combinedText}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text?.trim() || null;
    console.log("Gemini Key Loaded:", !!process.env.GEMINI_API_KEY);

  } catch (error) {
    console.error("Gemini AI error:", error.message);
    return null; // graceful fallback
  }
}
