import axios from 'axios';

async function testIdentify() {
    console.log("Calling /api/multi-search/identify for 'Elon Musk'...");
    try {
        const response = await axios.post("http://localhost:5000/api/multi-search/identify", {
            name: "Elon Musk"
        }, {
            timeout: 60000 // Give it a long timeout
        });
        
        const { candidates } = response.data;
        console.log(`Found ${candidates.length} candidates.`);
        candidates.forEach((c, i) => {
            console.log(`[${i}] Name: ${c.name} | Sources: ${c.otherSources.join(', ')}`);
            if (c.socials) {
                console.log(`   Socials count: ${c.socials.length}`);
            }
        });
    } catch (err) {
        console.error("Identify failed:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
        }
    }
}

testIdentify();
