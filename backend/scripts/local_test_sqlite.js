import { sqliteSearch } from "../db/sqlite.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
    const testName = "Mihir Doshi";
    console.log(`Testing sqliteSearch for: "${testName}"`);

    // Check if db is initialized in the module
    const results = sqliteSearch(testName);
    console.log("Results found:", results.length);
    if (results.length > 0) {
        console.log("First result:", JSON.stringify(results[0], null, 2));
    } else {
        console.warn("No results returned from sqliteSearch!");

        // Debug path
        const expectedDbPath = path.resolve(__dirname, "../company.db");
        console.log("Expected DB Path:", expectedDbPath);
        console.log("Exists:", fs.existsSync(expectedDbPath));
    }
}

test();
