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

    const prompt = `
You are an expert identity research assistant. I need to identify a specific person from a list of search results.

Criteria:
- Name: ${name}
- Location: ${location || "Not specified"}
- Keywords: ${keywords || "Not specified"}

Search Results:
${JSON.stringify(searchResults, null, 2)}

Instructions:
1. Analyze the search results to find unique individuals matching the criteria.
2. Group results by the person they represent.
3. For each unique person identified, provide:
   - name: Their full name.
   - description: A concise professional title or role (e.g., "Software Engineer", "Marketing Manager").
   - location: Their city/country if available.
   - confidence: "high", "medium", or "low" based on how well they match the keywords and name.
4. Limit the list to top 5 candidates.
5. If no candidates are found that match the name, return "No confident candidates found".

Output format (JSON ARRAY ONLY):
[
  {
    "name": "Ahmed Khatri",
    "description": "Student at XYZ University",
    "location": "Mumbai",
    "confidence": "high"
  },
  {
    "name": "Ahmed Khatri",
    "description": "Senior Civil Engineer",
    "location": "Dubai",
    "confidence": "medium"
  }
]
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
