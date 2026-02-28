import fetch from 'node-fetch';

async function testDeepSearch() {
    const url = 'http://localhost:5000/api/multi-search/deep';
    const payload = {
        person: {
            name: "Mihir Doshi",
            description: "Cyhex Infotech",
            location: "India",
            sources: ["Internet"],
            confidence: "High",
            phoneNumbers: [],
            emails: []
        }
    };

    try {
        console.log("Requesting deep search for Mihir Doshi...");
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(`Error: ${res.status}`);
            const text = await res.text();
            console.error(text);
            return;
        }

        const data = await res.json();
        console.log("Deep Search Response:");
        console.log("Person Name:", data.person.name);
        console.log("Image Count:", data.images.length);
        console.log("Images (Raw First Item):", JSON.stringify(data.images[0], null, 2));
        console.log("Socials:", data.socials.length);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testDeepSearch();
