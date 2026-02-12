
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function debugDeepSearch() {
    const name = "Pankaj Rathod";
    const location = "Mumbai";
    const profession = "SBMP";
    const url = "";

    console.log(`\n=== Debugging Deep Search for: ${name} ===`);

    // 1. Replicate Query Logic from multiSearch.js
    let hints = [
        location !== "none" ? location : "",
        profession !== "none" ? profession.substring(0, 30) : ""
    ].filter(Boolean).join(" ");

    let targetedQuery = `"${name}"`;
    targetedQuery += ` (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com) ${hints}`;

    console.log(`Targeted Query: ${targetedQuery}`);

    try {
        const response = await axios.get("https://serpapi.com/search", {
            params: {
                q: targetedQuery,
                engine: "google",
                api_key: process.env.SERPAPI_KEY,
                num: 20
            }
        });

        const results = response.data?.organic_results || [];
        console.log(`\nSerpAPI returned ${results.length} total results.`);

        // 2. Replicate Filtering Logic
        console.log("\n--- Processing Results ---");
        const filtered = results.filter(r => {
            const link = (r.link || "").toLowerCase();
            const title = (r.title || "").toLowerCase();

            // Check for directory filter
            const isDirectory =
                link.includes("/search/") ||
                link.includes("/pub/dir/") ||
                title.includes("profiles |") ||
                title.includes("search results");

            if (isDirectory) {
                console.log(`[FILTER] Dropped (Directory): ${title} - ${link}`);
                return false;
            }
            return true;
        });

        console.log(`\nFiltered Results (${filtered.length}):`);
        filtered.forEach((r, i) => {
            console.log(`[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}\n`);
        });

    } catch (err) {
        console.error("Error:", err.message);
    }
}

debugDeepSearch();
