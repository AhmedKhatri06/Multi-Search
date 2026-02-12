
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const targetName = "Mihir Doshi";
const simpleMode = false;

// COPY OF THE FILTER LOGIC from multiSearch.js
function testFilter(results) {
    results.forEach(item => {
        let title = (item.title || "").toLowerCase();
        let snippet = (item.snippet || "").toLowerCase();
        let link = (item.link || "").toLowerCase();
        let nameLower = targetName.toLowerCase();

        console.log(`\n\n--- Analyzing: "${item.title}" ---`);

        // 🔹 DEEP MODE: Strict Name & Site Filters
        const nameParts = nameLower.split(" ").filter(p => p.length > 1);

        // 1. Check for PRESENCE of all main name parts
        const hasAllParts = nameParts.every(part => title.includes(part) || snippet.includes(part));
        if (!hasAllParts) {
            if (!title.includes(nameParts[0])) {
                console.log(`❌ Dropped (Name Mismatch): ${title}`);
                return;
            }
        }

        // 2. STRICT NAME BOUNDARY CHECK (Prefix & Postfix)
        const titleLower = title.toLowerCase();
        const targetNameStr = nameParts.join(" ");
        const nameIndex = titleLower.indexOf(targetNameStr);

        if (nameIndex !== -1) {
            const separators = ["-", "|", ":", ",", "·", "•", "(", ")", "[", "]", " at ", " from ", " for "];

            // --- PREFIX CHECK ---
            if (nameIndex > 0) {
                const preceedingText = titleLower.substring(0, nameIndex).trim();
                const lastChar = preceedingText.slice(-1);

                if (!separators.some(sep => sep.trim() === lastChar || preceedingText.endsWith(sep))) {
                    const wordsBefore = preceedingText.split(" ");
                    const wordBefore = wordsBefore[wordsBefore.length - 1];

                    const allowedPrefixes = ["mr", "mr.", "dr", "dr.", "prof", "user", "member", "student", "about", "images", "photos", "profile", "view"];

                    if (wordBefore && !allowedPrefixes.includes(wordBefore) && isNaN(wordBefore)) {
                        console.log(`❌ Dropped (Prefix '${wordBefore}'): ${title}`);
                        return;
                    }
                }
            }

            // --- POSTFIX CHECK ---
            const endIndex = nameIndex + targetNameStr.length;
            if (endIndex < titleLower.length) {
                const followingText = titleLower.substring(endIndex).trim();
                const firstChar = followingText.charAt(0);

                if (!separators.some(sep => sep.trim() === firstChar || followingText.startsWith(sep))) {
                    const wordsAfter = followingText.split(" ");
                    const wordAfter = wordsAfter[0];

                    const allowedSuffixes = ["jr", "sr", "iii", "phd", "md", "profile", "contact", "info", "linkedin", "instagram", "facebook", "twitter", "defined", "wiki", "bio", "net", "org", "com"];

                    if (wordAfter && !allowedSuffixes.includes(wordAfter) && isNaN(wordAfter) && wordAfter.length > 1) {
                        console.log(`❌ Dropped (Postfix '${wordAfter}'): ${title}`);
                        return;
                    }
                }
            }
        }

        console.log(`✅ ACCEPTED`);
    });
}

// SIMULATE DATA (MOCKING WHAT SERPAPI LIKELY RETURNS)
// We include a mix of likely results to see what passes.
const mockResults = [
    { title: "Mihir Doshi | LinkedIn", link: "https://in.linkedin.com/in/mihir-doshi", snippet: "View Mihir Doshi's profile on LinkedIn..." },
    { title: "Mihir Doshi - Co-founder - Cyhex Infotech", link: "https://in.linkedin.com/in/mihir-doshi-88b", snippet: "Mihir Doshi. Co-founder & Director at Cyhex Infotech..." },
    { title: "Mihir Doshi (@mihirdoshi) • Instagram photos and videos", link: "https://www.instagram.com/mihirdoshi/", snippet: "..." },
    { title: "We are proud to announce that CyHEX Infotech...", link: "https://www.facebook.com/cyhex/", snippet: "Post by Cyhex..." }, // This is the Facebook result user saw
    { title: "Dr. Mihir Doshi Profile", link: "https://...", snippet: "..." },
    { title: "Haziq Mihir Doshi", link: "https://...", snippet: "..." }, // Should fail prefix
    { title: "Mihir Doshi Khan", link: "https://...", snippet: "..." }    // Should fail postfix
];

console.log("=== RUNNING MOCK FILTER TEST ===");
testFilter(mockResults);

// UNCOMMENT TO RUN REAL SEARCH (Requires Valid Key)
/*
async function realSearch() {
    try {
        const query = "Mihir Doshi (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com)";
        console.log(`\n=== RUNNING REAL SERPAPI SEARCH: ${query} ===`);
        const res = await axios.get("https://serpapi.com/search", {
            params: {
                 q: query,
                 engine: "google",
                 api_key: process.env.SERPAPI_KEY,
                 num: 20
            }
        });
        const results = res.data.organic_results || [];
        console.log(`Fetched ${results.length} results.`);
        testFilter(results);
    } catch(e) { console.error(e.message); }
}
realSearch();
*/
