
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function checkSerpApi() {
    console.log("--- Checking SerpAPI ---");
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
        console.error("❌ SERPAPI_KEY is missing in .env");
        return;
    }
    console.log(`Key found: ${apiKey.substring(0, 5)}...`);

    const profileSites = [
        "site:linkedin.com/in/",
        "site:instagram.com",
        "site:facebook.com",
        "site:twitter.com",
        "site:x.com",
        "site:bumble.com",
        "site:rocketreach.co/p/",
        "site:linkedin.com/posts/"
    ].join(" OR ");
    const socialQuery = `Elon Musk (${profileSites})`.trim();

    try {
        const response = await axios.get("https://serpapi.com/search", {
            params: {
                q: socialQuery,
                engine: "google",
                api_key: apiKey,
                num: 20
            }
        });

        if (response.data.error) {
            console.error("❌ SerpAPI Error:", response.data.error);
        } else {
            console.log("✅ SerpAPI RAW RESPONSE:", JSON.stringify(response.data, null, 2).substring(0, 2000));
        }
    } catch (error) {
        console.error("❌ SerpAPI Request Failed:", error.response?.data?.error || error.message);
    }
}

async function checkGeminiOf() {
    console.log("\n--- Checking Gemini API ---");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing in .env");
        return;
    }
    console.log(`Key found: ${apiKey.substring(0, 5)}...`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    try {
        const result = await model.generateContent("Say hello");
        const response = await result.response;
        console.log("✅ Gemini API works! Response:", response.text().trim());
    } catch (error) {
        console.error("❌ Gemini API Request Failed:", error.message);
    }
}

async function run() {
    await checkSerpApi();
    await checkGeminiOf();
}

run();
