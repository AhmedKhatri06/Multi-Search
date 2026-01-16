import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary({ query, sources }) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Verified Data Sources:
${JSON.stringify(sources, null, 2)}

Task:
Write a factual, concise, professional summary (4–5 lines).
Do not speculate. Use only provided data.
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
console.log("Gemini key loaded:", !!process.env.GEMINI_API_KEY);