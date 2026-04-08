import axios from 'axios';
const API_KEY = '6571771afc311d0ec4cec5c1b5055c23fe55c2a0';

async function testSerper() {
    const q = "Elon Musk CEO of Tesla and SpaceX";
    console.log(`Testing Serper for specific query: "${q}"`);
    try {
        const response = await axios.post("https://google.serper.dev/search", { q, num: 10 }, {
            headers: { "X-API-KEY": API_KEY, "Content-Type": "application/json" },
            timeout: 10000
        });
        console.log("Results count:", response.data?.organic?.length || 0);
        response.data?.organic?.slice(0, 5).forEach(r => console.log("-", r.title));
    } catch (err) {
        console.error("Error:", err.message);
    }
}

testSerper();
