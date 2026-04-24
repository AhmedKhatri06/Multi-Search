import axios from 'axios';

async function test() {
    try {
        console.log("Testing POST http://localhost:5000/api/multi-search/identify...");
        const res = await axios.post('http://localhost:5000/api/multi-search/identify', {
            query: 'test'
        });
        console.log("Success! Status:", res.status);
    } catch (err) {
        console.log("Failed! Status:", err.response?.status);
        if (err.response?.status === 404) {
            console.log("Confirmed: 404 Not Found.");
        }
    }
}

test();
