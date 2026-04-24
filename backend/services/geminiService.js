import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Generate text using Google Gemini Flash (Fast & reliable)
 * @param {string} prompt 
 * @param {string} systemPrompt 
 * @returns {Promise<string>}
 */
export async function geminiGenerateText(prompt, systemPrompt = "") {
    try {
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser Request: ${prompt}` : prompt;
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("[Gemini] Generation failed:", error.message);
        throw error;
    }
}

/**
 * Generate structured JSON using Google Gemini Flash
 * @param {string} prompt 
 * @param {string} systemPrompt 
 * @returns {Promise<any>}
 */
export async function geminiGenerateJSON(prompt, systemPrompt = "") {
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: systemPrompt ? `${systemPrompt}\n\nData: ${prompt}` : prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        });
        const response = await result.response;
        return JSON.parse(response.text());
    } catch (error) {
        console.error("[Gemini] JSON Generation failed:", error.message);
        // Fallback: try to find JSON in text if mimeType fail
        const text = await geminiGenerateText(prompt, systemPrompt);
        const match = text.match(/\[\s*\{.*\}\s*\]/s) || text.match(/\{.*\}/s);
        if (match) return JSON.parse(match[0]);
        throw error;
    }
}

export default { geminiGenerateText, geminiGenerateJSON };
