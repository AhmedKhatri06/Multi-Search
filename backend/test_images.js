import { searchImages, searchInternet } from './services/internetSearch.js';
import { extractSocialAccounts } from './services/socialMediaService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
    console.log("Testing Exact Queries for Mihir Doshi...");
    const name = "Mihir Doshi";
    const profession = "Cyhex Infotech";

    try {
        const imageQuery = `"${name}" ${profession} "profile picture" OR "portrait"`.trim();
        console.log("Testing Image Query:", imageQuery);
        const imgResults = await searchImages(imageQuery, name, ["Cyhex", "Infotech"]);
        console.log("Image Results found:", imgResults.length);

        const socialQueryStrict = `"${name}" ${profession} (site:linkedin.com/in/ OR site:github.com OR site:twitter.com OR site:instagram.com OR site:facebook.com)`.trim();
        console.log("\nTesting Social Query:", socialQueryStrict);
        const socResults = await searchInternet(socialQueryStrict);
        console.log("Social Search Results found:", socResults.length);
    } catch (err) {
        console.error("Test failed:", err);
    }
}

test();
