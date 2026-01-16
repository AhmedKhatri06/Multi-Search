import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function compressSources(sources) {
  return sources.slice(0, 5).map(s => ({
    title: s.title || s.text,
    source: s.source,
    category: s.category || s.type
  }));
}

export async function generateAISummary({ query, sources }) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const compressedData = compressSources(sources);

    const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Facts:
${JSON.stringify(compressedData, null, 2)}

Task:
Write a factual, neutral summary in 4–5 lines.
Use only provided facts.
`;

    const result = await model.generateContent(prompt);
    return result.response.text();

  } catch (err) {
    console.error("Gemini summary failed:", err.message);
    return null;
  }
}
