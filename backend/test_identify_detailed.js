import axios from 'axios';

async function testIdentifyDetailed() {
    console.log("Calling /api/multi-search/identify for 'Elon Musk' (Detailed check)...");
    try {
        const response = await axios.post("http://localhost:5000/api/multi-search/identify", {
            name: "Elon Musk"
        }, {
            timeout: 60000
        });
        
        const { candidates } = response.data;
        console.log(`Found ${candidates.length} candidates in response.`);
        
        candidates.forEach((c, i) => {
            const sources = c.otherSources || [];
            console.log(`[${i}] Name: ${c.name} | Sources: ${sources.join(', ')} | URL: ${c.url || 'none'}`);
        });
        
        const internetCount = candidates.filter(c => (c.otherSources || []).includes('internet')).length;
        console.log(`\nInternet-sourced candidates found: ${internetCount}`);
        
    } catch (err) {
        console.error("Identify failed:", err.message);
    }
}

testIdentifyDetailed();
