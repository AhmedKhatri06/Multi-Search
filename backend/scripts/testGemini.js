import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("Available models (first 5):");
        data.models.slice(0, 5).forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods.join(", ")})`));

        const targetModel = data.models.find(m => m.supportedGenerationMethods.includes("generateContent")).name;
        console.log(`\nTrying explicitly with: ${targetModel}`);

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent("test");
        console.log("Success!");
        console.log(result.response.text());
    } catch (e) {
        console.error("Error:", e);
    }
}

listModels();
