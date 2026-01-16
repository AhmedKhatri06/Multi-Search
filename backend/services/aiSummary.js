import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateAISummary(query, sources) {
  try {
    // Safety checks
    if (!query || !sources || sources.length === 0) {
      console.warn("AI summary skipped: insufficient data");
      return "AI summary not available";
    }

    // Prepare facts (limit to avoid token overflow)
    const facts = sources
      .slice(0, 6)
      .map((s, i) => {
        return `${i + 1}. ${s.content || s.text || s.title || "Unknown fact"} (${s.source || "source"})`;
      })
      .join("\n");

    const prompt = `
You are an AI research assistant like DeepSearch AI.

Search Query:
"${query}"

Facts:
${facts}

Task:
Write a factual, neutral summary in 3–4 sentences.
Avoid assumptions. Do not add new information.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You summarize factual data clearly and professionally." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 160,
    });

    const summary =
      response?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      console.error("OpenAI returned empty summary");
      return "AI summary not available";
    }

    return summary;

  } catch (err) {
    console.error("OpenAI summary error:", err.message);
    return "AI summary not available";
  }
}
