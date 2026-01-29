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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an intelligent assistant helping me identify people. 
I will give you:

- Name: ${name}
- Location: ${location || "Not specified"}
- Keywords: ${keywords || "Not specified"}

Search Results context:
${JSON.stringify(searchResults, null, 2)}

Your task:

1. Analyze this information and use the search results as context.
2. Return a list of possible people matching this information. If the query includes context like a company or school (e.g., "Pankaj SBMP"), prioritize results that mention those entities in the title or snippet.
3. For each person, provide:
   - Name (Use the full name found in the search result)
   - Short description (role, company, or key identifier)
   - Location (if known)
   - Source confidence (low / medium / high) - "high" if name AND keywords match well.
4. Limit the list to 3–5 people.
5. Keep the descriptions concise and structured so I can display them in my UI for the user to select the correct person.
6. If there is no clear match or the search results are irrelevant, return “No confident candidates found”.

Output format (JSON):
[
  {
    "name": "Mihir Doshi",
    "description": "Software Engineer at Cyhex",
    "location": "Mumbai",
    "confidence": "high"
  },
  {
    "name": "Mihir Doshi",
    "description": "Business Analyst",
    "location": "Ahmedabad",
    "confidence": "medium"
  }
]
IMPORTANT: Return ONLY the JSON array. Do not include any markdown formatting like \`\`\`json or explanations.
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
            return "No confident candidates found";
        }

        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : "No confident candidates found";
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", text);
            return "No confident candidates found";
        }
    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};
