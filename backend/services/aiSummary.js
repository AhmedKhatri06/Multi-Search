import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateAISummary({ query, sources }) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Verified Data:
${JSON.stringify(sources.slice(0, 5), null, 2)}

Task:
Write a clear, factual summary in 4–5 lines.
Do not assume anything.
`;

    const result = await model.generateContent(prompt);
    return result.response.text();

  } catch (err) {
    console.error("Gemini error:", err.message);
    return null;
  }
}
