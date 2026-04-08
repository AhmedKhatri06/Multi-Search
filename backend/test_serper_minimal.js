import axios from 'axios';
const API_KEY = '6571771afc311d0ec4cec5c1b5055c23fe55c2a0';

async function testSerper() {
    console.log("Testing Serper API...");
    try {
        const response = await axios.post("https://google.serper.dev/search", {
            q: "Elon Musk",
            num: 10
        }, {
            headers: {
                "X-API-KEY": API_KEY,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });
        console.log("Status:", response.status);
        console.log("Results count:", response.data?.organic?.length || 0);
        if (response.data?.organic?.length > 0) {
            console.log("First result:", response.data.organic[0].title);
        }
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Response data:", JSON.stringify(err.response.data));
        }
    }
}

testSerper();
