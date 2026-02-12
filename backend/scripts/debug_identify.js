import axios from "axios";

async function testIdentify(name, keywords = "") {
    console.log(`Testing identification for: "${name}" with keywords: "${keywords}"`);
    try {
        const res = await axios.post("http://localhost:5000/api/multi-search/identify", {
            name,
            keywords
        });
        console.log("Success! Candidates found:", res.data.length);
        res.data.forEach(c => console.log(` - ${c.name} (${c.location})`));
    } catch (err) {
        console.error("Failed:", err.response?.data || err.message);
    }
}

async function clearServerCache() {
    console.log("Clearing server cache via API...");
    try {
        const res = await axios.post("http://localhost:5000/api/multi-search/clear-cache");
        console.log("Cache cleared! Items removed:", res.data.count);
    } catch (err) {
        console.error("Failed to clear cache:", err.message);
    }
}

async function runTests() {
    await clearServerCache();
    await testIdentify("Elon Musk");
    await testIdentify("Pankaj Rathod", "sbmp");
}

runTests();
