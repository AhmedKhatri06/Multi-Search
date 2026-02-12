import { performSearch } from "../routes/multiSearch.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for Test");

        const query = "Elon Musk (site:linkedin.com/in/ OR site:wikipedia.org/wiki/)";
        console.log(`Running performSearch for: "${query}"`);

        // Call performSearch with simpleMode=true (Identify mode)
        const results = await performSearch(query, true);

        console.log(`\n--- TEST RESULTS ---`);
        console.log(`Total Passed: ${results.length}`);
        results.forEach((r, i) => {
            console.log(`${i + 1}. [${r.provider}] ${r.title}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error("Test Error:", err);
    }
}

runTest();
