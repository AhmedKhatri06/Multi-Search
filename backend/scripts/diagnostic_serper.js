import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Force load env from the backend directory
dotenv.config({ path: path.resolve('backend', '.env') });

const apiKey = (process.env.SERPER_API_KEY || "").trim();

console.log(`[Diagnostic] API Key detected: ${apiKey ? "YES (length: " + apiKey.length + ")" : "NO"}`);

async function testSerper(q, num) {
    console.log(`[Test] Query: "${q}" | Num: ${num}`);
    try {
        const response = await axios.post("https://google.serper.dev/search", { q, num }, {
            headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
            timeout: 10000
        });
        console.log(`[Test] SUCCESS: Found ${response.data.organic?.length || 0} results`);
    } catch (err) {
        console.error(`[Test] FAILED (Status ${err.response?.status}): ${err.message}`);
        console.error(`[Test] Error Body: ${JSON.stringify(err.response?.data || "No body")}`);
    }
}

async function run() {
    await testSerper("test", 10);
    console.log("---");
    await testSerper("dhruvil jain cyhex", 50);
    console.log("---");
    await testSerper('"dhruvil jain" cyhex site:linkedin.com/in/', 1);
}

run();
