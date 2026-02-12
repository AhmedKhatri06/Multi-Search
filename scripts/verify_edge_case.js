import axios from 'axios';

const API_URL = 'http://localhost:5000/api/nexa-search/disambiguate';

const testSearch = async (query) => {
    console.log(`\nTesting search for: "${query}"`);
    try {
        const response = await axios.post(API_URL, { query });
        const candidates = response.data.candidates || [];

        console.log(`Found ${candidates.length} candidates.`);
        candidates.forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.name} - ${c.description} (Confidence: ${c.confidence})`);
        });

        if (candidates.length === 0) {
            console.log("  [SUCCESS] No results found as expected (or unexpectedly).");
        } else {
            // Check format rule: "Full Name - Keyword"
            const validFormat = candidates.every(c => c.name.includes(' - ') || c.name.includes(' | '));
            if (validFormat) {
                console.log("  [SUCCESS] All candidate names follow 'Name - Keyword' format.");
            } else {
                console.log("  [WARNING] Some candidate names likely missing ' - Keyword' format.");
                candidates.forEach(c => {
                    if (!c.name.includes(' - ') && !c.name.includes(' | ')) {
                        console.log(`    - Invalid format: "${c.name}"`);
                    }
                });
            }
        }

    } catch (error) {
        console.error("  [ERROR] Search failed:", error.message);
        if (error.response) {
            console.error("  Dataset:", error.response.data);
        }
    }
};

const runTests = async () => {
    await testSearch("John Smith");
    await testSearch("Xylophone Zzyzx 123456789");
};

runTests();
