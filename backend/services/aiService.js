import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const systemPrompt = `
      You are an expert entity resolution system. Your task is to identify unique individuals from a list of search results.
      
      STEPS:
      1. Analyze all search results.
      2. Cluster results that refer to the SAME person (e.g. "Pankaj Rathod on LinkedIn" and "Pankaj Rathod | VJTI" might be the same).
      3. For each unique person, generate a distinct entry. If multiple profiles clearly belong to different people (different jobs/locations), DO NOT cluster them.
      4. FORMAT RULE: The 'name' field MUST be in the format "Full Name - Keyword" (e.g. "Pankaj Rathod - SBMP", "Pankaj Shah - CEO").
      5. Include the primary 'url' (e.g. LinkedIn or personal site) for that specific person.
      6. Limit the list to top 20 candidates.
      7. If no candidates are found that match the name, return "No confident candidates found".
      
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
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

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
        console.error("AI Service Error:", error);
        throw error;
    }
};

/**
 * Generate text using Gemini AI
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export const generateText = async (prompt) => {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("AI generateText Error:", error);
        throw error;
    }
};
