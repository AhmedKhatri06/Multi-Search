
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import FormInfo from "../models/FormInfo.js";
import SearchHistory from "../models/SearchHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function debugData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("--- Recent FormInfo (Feedback) ---");
        const recentForms = await FormInfo.find().sort({ timestamp: -1 }).limit(5);
        recentForms.forEach(f => console.log(`Name: ${f.name}, Keyword: ${f.keyword}, Location: ${f.location}`));

        console.log("\n--- Recent SearchHistory ---");
        const recentHistory = await SearchHistory.find().sort({ timestamp: -1 }).limit(5);
        recentHistory.forEach(h => console.log(`Query: ${h.query}`));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

debugData();
