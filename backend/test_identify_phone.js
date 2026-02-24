
import axios from 'axios';

async function testIdentifyPhone() {
    const phone = "9820098200"; // A common dummy number or a known reachable one
    console.log(`Testing identification for phone: ${phone}`);

    try {
        const response = await axios.post('http://localhost:5000/api/multi-search/identify', {
            name: phone
        });

        console.log("Candidates found:", response.data.length);
        response.data.forEach((c, i) => {
            console.log(`[${i + 1}] ${c.name} (${c.source}) - ${c.description}`);
        });

        const hasInternet = response.data.some(c => c.source === 'internet' || c.source === 'Web');
        if (hasInternet) {
            console.log("SUCCESS: Web candidates found for phone number.");
        } else {
            console.log("LOG: No web candidates for this specific phone, but check if local results appear.");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

testIdentifyPhone();
