
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Document from "../models/Document.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        // Remove existing to avoid dupes
        await Document.deleteMany({ text: { $regex: "Pankaj Local Profile", $options: "i" } });

        await Document.create({
            text: "Pankaj Local Profile - Verified Employee at TechCorp. Location: Mumbai. Role: Senior Developer.",
            metadata: { source: "Manual Seed" }
        });

        console.log("✅ Seeded 'Pankaj Local Profile' into MongoDB.");
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

seed();
