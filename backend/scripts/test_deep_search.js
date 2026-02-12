
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function testDeepSearch() {
    const name = "Pankaj Rathod";
    const location = "Mumbai"; // Assuming
    const profession = "SBMP"; // Assuming
    const url = ""; // Let's see if this changes anything

    let targetedQuery = `"${name}" ${location} ${profession.substring(0, 30)}`;
    targetedQuery += " (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com)";

    console.log(`Query: ${targetedQuery}`);

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
        console.log(`Found ${results.length} results.`);
        results.forEach((r, i) => {
            console.log(`[${i}] ${r.title} - ${r.link}`);
        });

    } catch (err) {
        console.error("Error:", err.message);
    }
}

testDeepSearch();
