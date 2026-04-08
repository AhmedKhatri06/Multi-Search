import { performSearch } from "./routes/multiSearch.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

async function test() {
    console.log("Testing performSearch for 'Elon Musk'...");
    console.log("Serper API Key present:", !!process.env.SERPER_API_KEY);
    try {
        const results = await performSearch("Elon Musk", true);
        console.log(`Found ${results.length} results.`);
        if (results.length === 0) {
            console.log("No internet results found. This confirms the issue.");
        } else {
            results.slice(0, 10).forEach((r, i) => {
                console.log(`[${i}] Title: ${r.title} | Provider: ${r.provider} | URL: ${r.url}`);
            });
        }
    } catch (err) {
        console.error("Search failed with error:", err.message);
        if (err.response) {
            console.error("API Response data:", err.response.data);
        }
    }
}

test();
