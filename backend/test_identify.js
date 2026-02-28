import fetch from 'node-fetch';

async function testIdentify() {
    console.log("Requesting identification for Mihir Doshi...");
    try {
        const res = await fetch("http://localhost:5000/api/multi-search/identify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Mihir Doshi" })
        });
        if (!res.ok) {
            console.error("Identify failed:", res.status, await res.text());
            return;
        }
        const data = await res.json();
        console.log("Identify Response:");
        console.log("Candidate Count:", data.candidates.length);
        console.log("First Candidate:", data.candidates[0].name);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testIdentify();
