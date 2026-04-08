import axios from 'axios';
const API_KEY = '6571771afc311d0ec4cec5c1b5055c23fe55c2a0';

async function testSerperComplex() {
    const name = "Elon Musk";
    const profileSites = [
        "site:linkedin.com/in/", "site:instagram.com", "site:facebook.com",
        "site:twitter.com", "site:x.com", "site:crunchbase.com/person/",
        "site:en.wikipedia.org", "site:imdb.com/name/"
    ].join(" OR ");
    const q = `${name} (${profileSites})`.trim();
    
    console.log(`Testing Serper for Complex Query: "${q}"`);
    try {
        const response = await axios.post("https://google.serper.dev/search", { q, num: 60 }, {
            headers: { "X-API-KEY": API_KEY, "Content-Type": "application/json" },
            timeout: 20000
        });
        console.log("Status:", response.status);
        console.log("Results count:", response.data?.organic?.length || 0);
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Data:", JSON.stringify(err.response.data));
        }
    }
}

testSerperComplex();
