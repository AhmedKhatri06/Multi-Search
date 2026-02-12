import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import SearchCache from "../models/SearchCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function clearCache() {
    try {
        await mongoose.connect(process.env.MONGO_URI, { dbName: "multi-search-prod" });
        console.log("Connected to MongoDB");

        // Clear ALL cache entries (IDENTIFY and SEARCH)
        const result = await SearchCache.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} total cached results`);

        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

clearCache();
