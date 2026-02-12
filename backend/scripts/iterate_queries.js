
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function iterateQueries() {
    const name = "Pankaj Rathod";
    const queries = [
        // 1. Current failing query
        `"${name}" (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com) Mumbai SBMP`,
        // 2. Remove location
        `"${name}" (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com) SBMP`,
        // 3. Remove professional keyword
        `"${name}" (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com) Mumbai`,
        // 4. Just name and sites
        `"${name}" (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com)`,
        // 5. Broadest: just name and "social media"
        `"${name}" social media Mumbai`
    ];

    for (const q of queries) {
        console.log(`\nTesting: ${q}`);
        try {
            const res = await axios.get("https://serpapi.com/search", {
                params: {
                    q: q,
                    engine: "google",
                    api_key: process.env.SERPAPI_KEY,
                    num: 10
                }
            });
            const count = res.data.organic_results?.length || 0;
            console.log(` - Results: ${count}`);
            if (count > 0) {
                console.log(` - Top Result: ${res.data.organic_results[0].title}`);
            }
        } catch (err) {
            console.log(` - Failed: ${err.message}`);
        }
    }
}

iterateQueries();
