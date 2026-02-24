
import axios from 'axios';

async function testIdentify() {
    const query = "Sundar Pichai"; // Should definitely be on the internet, probably not in local DB
    console.log(`Testing identification for: ${query}`);

    try {
        const response = await axios.post('http://localhost:5000/api/multi-search/identify', {
            name: query
        });

        console.log("Candidates found:", response.data.length);
        response.data.forEach((c, i) => {
            console.log(`[${i + 1}] ${c.name} (${c.source}) - ${c.description}`);
        });

        const hasInternet = response.data.some(c => c.source === 'internet' || c.source === 'Web');
        if (hasInternet) {
            console.log("SUCCESS: Internet candidates found.");
        } else {
            console.log("FAILURE: No internet candidates found.");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
        }
    }
}

testIdentify();
