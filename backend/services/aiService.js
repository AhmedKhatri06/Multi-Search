import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || "").trim() });

/**
 * Identifies people based on user criteria and search context.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.location]
 * @param {string} [params.keywords]
 * @param {Array} params.searchResults
 * @returns {Promise<Array|string>} Structured list of people or "No confident candidates found"
 */
export const identifyPeople = async ({ name, location, keywords, searchResults }) => {
    if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    const systemPrompt = `
      You are an expert entity resolution system. Your task is to identify unique individuals from a list of search results.
      
      STEPS:
      1. Analyze all search results.
      2. Cluster results that refer to the SAME person.
      3. For a NAME search, focus on resolving the specific individual.
      4. For a PHONE/CONTACT search, look for the person most strongly associated with that number (e.g., in directory listings, bios, or contact pages).
      5. FORMAT RULE: The 'name' field MUST be in the format "Full Name - Keyword" (e.g. "Pankaj Rathod - SBMP", "Pankaj Shah - CEO").
      6. Include the primary 'url' (e.g. LinkedIn or personal site) for that specific person.
      7. Limit the list to top 20 candidates.
      8. If no candidates are found that match the criteria, return "No confident candidates found".
      
      OUTPUT JSON ARRAY:
      [
        {
          "name": "Name - Keyword",
          "description": "Brief summary of who they are (max 15 words).",
          "location": "City/Region if found, else 'Unknown'",
          "confidence": "high",
          "url": "https://specific-profile-url.com"
        }
      ]
      
      Strictly return ONLY the JSON array. No markdown.
    `;

    const prompt = `
Criteria:
- Name: ${name}
- Location: ${location || "Not specified"}
- Keywords: ${keywords || "Not specified"}

Search Results:
${JSON.stringify(searchResults, null, 2)}
`;

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout")), 25000)
        );

        const groqCall = groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.3,
        });

        // Race the Groq call against a 25s timeout
        const chatCompletion = await Promise.race([groqCall, timeout]);

        let text = chatCompletion.choices[0]?.message?.content?.trim() || "";

        // Safety check for common AI formatting
        if (text.startsWith("```")) {
            text = text.replace(/```(json)?/g, "").replace(/```/g, "").trim();
        }

        if (text.includes("No confident candidates found")) {
            return [];
        }

        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", text);
            return [];
        }
    } catch (error) {
        console.error("AI Service Error (Hang/Timeout/Failure):", error.message);
        // Return empty array on timeout to allow search to proceed with local/raw results
        return [];
    }
};


/**
 * Generate text using Groq AI
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export const generateText = async (prompt) => {
    if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout (generateText)")), 25000)
        );

        const groqCall = groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a professional research analyst. Generate concise, insight-driven summaries based on the provided data. Focus on key facts, notable achievements, and actionable insights. Avoid generic filler text. Write in a clear, professional tone suitable for UI display."
                },
                { role: "user", content: prompt }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.5,
        });

        const chatCompletion = await Promise.race([groqCall, timeout]);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("AI generateText Error (Hang/Timeout/Failure):", error.message);
        return ""; // Return empty string to allow UI to render without summary
    }
};
