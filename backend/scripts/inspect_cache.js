
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import SearchCache from "../models/SearchCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);

        const query = "elon";
        console.log(`\n=== performing Cache Lookup for: "${query}" ===`);

        const cached = await SearchCache.findOne({ query: query, type: "SEARCH" });

        if (!cached) {
            console.log("❌ No cache found for 'elon'");
        } else {
            console.log("✅ Cache found!");
            console.log(`Data Length: ${cached.data.length}`);
            console.log("First 3 items:");
            console.log(JSON.stringify(cached.data.slice(0, 3), null, 2));
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
