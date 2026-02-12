
import axios from "axios";

async function testDeepApi() {
    const payload = {
        person: {
            name: "Pankaj Rathod",
            description: "SBMP",
            location: "Mumbai",
            confidence: "Manual",
            source: "internet",
            url: ""
        }
    };

    console.log("Sending Deep Search request...");
    try {
        const res = await axios.post("http://localhost:5000/api/multi-search/deep", payload);
        console.log("Status:", res.status);
        console.log("Socials:", res.data.socials?.length || 0);
        console.log("Sources:", res.data.articles?.length || 0);
        console.log("Images:", res.data.images?.length || 0);

        if (res.data.articles) {
            console.log("\nSample Sources:");
            res.data.articles.slice(0, 3).forEach(a => console.log(` - ${a.title} (${a.url})`));
        }
    } catch (err) {
        console.error("API Error:", err.response?.data || err.message);
    }
}

testDeepApi();
