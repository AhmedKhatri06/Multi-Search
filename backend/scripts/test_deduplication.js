import axios from "axios";

async function testDeduplication() {
    try {
        console.log("Testing /identify endpoint with 'Mihir Doshi'...\n");

        const response = await axios.post("http://localhost:5000/api/multi-search/identify", {
            name: "Mihir Doshi"
        });

        const candidates = response.data;

        console.log(`Total candidates returned: ${candidates.length}\n`);

        candidates.forEach((candidate, idx) => {
            console.log(`[${idx + 1}] ${candidate.name}`);
            console.log(`    Description: ${candidate.description}`);
            console.log(`    Location: ${candidate.location}`);
            console.log(`    Confidence: ${candidate.confidence}`);
            console.log("");
        });

        // Check for duplicates
        const names = candidates.map(c => c.name.toLowerCase());
        const uniqueNames = new Set(names);

        if (names.length !== uniqueNames.size) {
            console.log("❌ DUPLICATES FOUND!");
            console.log(`Total: ${names.length}, Unique: ${uniqueNames.size}`);
        } else {
            console.log("✅ No duplicates - deduplication working!");
        }

    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Response:", error.response.data);
        }
    }
}

testDeduplication();
