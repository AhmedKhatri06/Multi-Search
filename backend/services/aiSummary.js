import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary(query, sources) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Verified Sources:
${JSON.stringify(sources, null, 2)}

Task:
Write a clear, factual AI summary in 4–5 lines.
• No assumptions
• No speculation
• Only based on provided data
• Professional tone
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
