import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary({ query, sources }) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Sources:
${JSON.stringify(sources, null, 2)}

Task:
Give a short, clear, professional summary (4–5 lines).
Avoid assumptions. Be factual.
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
