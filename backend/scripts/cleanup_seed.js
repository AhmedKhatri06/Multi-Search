
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Document from "../models/Document.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const res = await Document.deleteMany({ text: { $regex: "Pankaj Local Profile", $options: "i" } });
        console.log(`Cleanup complete. Deleted ${res.deletedCount} documents.`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

cleanup();
