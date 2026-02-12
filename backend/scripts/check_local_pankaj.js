
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function checkLocalData() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);

        const query = "Pankaj";
        console.log(`\n=== Checking Local DB for: "${query}" ===`);

        // MongoDB
        const mongoResults = await Document.find({
            text: { $regex: query, $options: "i" }
        });
        console.log(`MongoDB Matches: ${mongoResults.length}`);
        mongoResults.forEach(r => console.log(` - [MONGO] ${r.text.substring(0, 50)}...`));

        // SQLite
        try {
            const sqliteResults = await sqliteSearch(query);
            console.log(`SQLite Matches: ${sqliteResults.length}`);
            sqliteResults.forEach(r => console.log(` - [SQLITE] ${r.name} (${r.title})`));
        } catch (e) {
            console.log("SQLite check skipped/failed (might not be mocked locally).");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

checkLocalData();
