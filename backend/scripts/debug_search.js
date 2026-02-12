
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { performSearch } from "../routes/multiSearch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);

        // Use the query from the screenshot
        const query = "Elon";
        console.log(`\n=== performingSearch("${query}") ===`);

        // We need to mock SearchCache or clear it to ensure we hit SerpAPI
        // But since performSearch imports the model directly, we can just clear it here if needed.
        // Or rely on the fact that "Elon" might not be cached if previous runs failed or were different.

        const results = await performSearch(query);
        console.log(`\n=== Final Results Count: ${results.length} ===`);
        console.log(JSON.stringify(results.map(r => ({ title: r.title, source: r.source, provider: r.provider, url: r.url })), null, 2));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
